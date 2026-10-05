require('dotenv/config');
const mariadb = require('mariadb');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const dir = path.resolve(process.argv[2]);
const input = JSON.parse(fs.readFileSync(path.join(dir, 'registrations.json'), 'utf8'));
const audit = JSON.parse(fs.readFileSync(path.join(dir, 'database-audit.json'), 'utf8'));
const backup = JSON.parse(fs.readFileSync(path.join(dir, 'backup-before-import.json'), 'utf8'));
const json = v => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? String(x) : x, 2);
const valid = value => {
  if (!/^\d{11}$|^\d{14}$/.test(value) || new Set(value).size === 1) return false;
  const weights = value.length === 11
    ? [[10,9,8,7,6,5,4,3,2], [11,10,9,8,7,6,5,4,3,2]]
    : [[5,4,3,2,9,8,7,6,5,4,3,2], [6,5,4,3,2,9,8,7,6,5,4,3,2]];
  return weights.every(w => {
    const remainder = w.reduce((total, n, i) => total + n * Number(value[i]), 0) % 11;
    return Number(value[w.length]) === (remainder < 2 ? 0 : 11 - remainder);
  });
};
const issues = [];
function issue(entity, row, field, reason) { issues.push({ entity, row: row.source_row, identifier: row.plate || row.cpf, field, reason }); }
const companyCodes = new Set(audit.companies.map(c => c.sigla));
const typeCodes = new Set(audit.types.map(t => String(t.codVehicleType)));
for (const d of input.drivers) {
  if (!valid(d.cpf)) issue('Motoristas', d, 'CPF', 'CPF inválido');
  if (!d.name || d.name.length > 50) issue('Motoristas', d, 'Nome', 'Nome ausente ou maior que 50 caracteres');
}
for (const v of input.vehicles) {
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(v.plate)) issue('Veículos', v, 'A: Placa', 'Placa inválida');
  if (!valid(v.owner)) issue('Veículos', v, 'J: CPF/CNPJ proprietário', 'Documento ausente ou inválido');
  if (!v.owner_name || v.owner_name.length > 50) issue('Veículos', v, 'E: Proprietário', 'Nome ausente ou maior que 50 caracteres');
  if (!companyCodes.has(v.empresa_sigla)) issue('Veículos', v, 'F: Empresa', `Empresa ${v.empresa_sigla} não cadastrada`);
  if (!typeCodes.has(v.type_code)) issue('Veículos', v, 'C: Tipo', 'Código de tipo não cadastrado');
}
for (const conflict of input.conflicting_records || []) for (const row of conflict.records) issue('Veículos', row, 'C: Tipo', 'Placa duplicada com dados divergentes');
const driverKeys = new Set(input.drivers.map(d => d.cpf));
const vehicleKeys = new Set(input.vehicles.map(v => v.plate));
const removed = {
  driver: backup.tables.driver.rows.filter(d => !driverKeys.has(String(d.cpf).padStart(11, '0'))).map(d => String(d.cpf)),
  vehicle: backup.tables.vehicle.rows.filter(v => !vehicleKeys.has(v.plate)).map(v => v.plate),
};
async function main() {
  if (createHash('sha256').update(fs.readFileSync(input.source)).digest('hex') !== input.sha256) throw new Error('Planilha alterada; exporte novamente antes de planejar.');
  const db = await mariadb.createConnection({ host: process.env.DATABASE_HOST, port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD, database: process.env.DATABASE_NAME, dateStrings: true });
  try {
    const dependencies = [];
    for (const fk of audit.foreignKeys) {
      const keys = removed[fk.REFERENCED_TABLE_NAME];
      if (!keys?.length) continue;
      const table = fk.TABLE_NAME, column = fk.COLUMN_NAME;
      if (![table, column].every(s => /^[a-zA-Z0-9_]+$/.test(s))) throw new Error('Identificador inesperado');
      const rows = await db.query(`SELECT \`${column}\` AS referenced_key, COUNT(*) AS total FROM \`${table}\` WHERE \`${column}\` IN (${keys.map(() => '?').join(',')}) GROUP BY \`${column}\``, keys);
      if (rows.length) dependencies.push({ table, column, target: fk.REFERENCED_TABLE_NAME, rows });
    }
    // Text snapshots in manifests are not FKs, but retain the affected plates in the plan.
    const history = removed.vehicle.length ? await db.query(`SELECT placa,COUNT(*) AS total FROM frete_carregamento_manifestos WHERE placa IN (${removed.vehicle.map(() => '?').join(',')}) GROUP BY placa`, removed.vehicle) : [];
    const plan = { sourceSha256: input.sha256, drivers: input.drivers.length, vehicles: input.vehicles.length,
      currentDrivers: backup.tables.driver.rows.length, currentVehicles: backup.tables.vehicle.rows.length,
      absentDrivers: removed.driver.length, absentVehicles: removed.vehicle.length,
      issues, dependencies, manifestPlatesAbsentFromExcel: history,
      executable: issues.length === 0 && dependencies.length === 0 && history.length === 0 };
    fs.writeFileSync(path.join(dir, 'import-plan.json'), json(plan));
    const quote = v => '"' + String(v ?? '').replaceAll('"', '""') + '"';
    fs.writeFileSync(path.join(dir,'pendencias.csv'), '\ufeff' + [['Cadastro','Linha Excel','Identificador','Coluna','Pendência'], ...issues.map(i => [i.entity,i.row,i.identifier,i.field,i.reason])].map(row => row.map(quote).join(';')).join('\r\n'), 'utf8');
    console.log(json({ drivers: plan.drivers, vehicles: plan.vehicles, issueCount: issues.length,
      affectedVehicleCount: new Set(issues.filter(i => i.entity === 'Veículos').map(i => i.identifier)).size,
      absentDrivers: plan.absentDrivers, absentVehicles: plan.absentVehicles,
      dependencies: dependencies.map(d => ({ table: d.table, target: d.target, keys: d.rows.length, references: d.rows.reduce((n,r) => n + Number(r.total),0) })),
      manifestPlatesAbsentFromExcel: history.length, executable: plan.executable }));
  } finally { await db.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
