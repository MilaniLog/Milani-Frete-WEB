// Default is a complete transactional rehearsal followed by rollback.
require('dotenv/config');
const mariadb = require('mariadb');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const dir = path.resolve(process.argv[2]);
const apply = process.argv.includes('--apply');
const sourceText = fs.readFileSync(path.join(dir, 'registrations.json'), 'utf8');
const source = JSON.parse(sourceText);
const plan = JSON.parse(fs.readFileSync(path.join(dir, 'import-plan.json'), 'utf8'));
const json = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v, 2);
const digest = value => createHash('sha256').update(json(value)).digest('hex');
const identifier = value => {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) throw new Error('Invalid SQL identifier');
  return '`' + value + '`';
};
async function main() {
  if (plan.sourceSha256 !== source.sha256 || createHash('sha256').update(fs.readFileSync(source.source)).digest('hex') !== source.sha256)
    throw new Error('A planilha mudou. Exporte e valide novamente antes de importar.');
  const db = await mariadb.createConnection({ host: process.env.DATABASE_HOST, port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD, database: process.env.DATABASE_NAME,
    dateStrings: true, charset: 'utf8mb4' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFile = path.join(dir, `import-${apply ? 'applied' : 'rehearsal'}-${stamp}.json`);
  let committed = false;
  try {
    const engines = await db.query("SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('driver','vehicle','companies')");
    if (engines.length !== 3 || engines.some(t => t.ENGINE !== 'InnoDB')) throw new Error('Importação exige tabelas transacionais.');
    const triggers = await db.query('SHOW TRIGGERS');
    if (triggers.some(t => ['driver','vehicle','companies'].includes(t.Table))) throw new Error('Há triggers a revisar antes da importação.');
    await db.beginTransaction();
    const old = {};
    for (const [table,key] of [['driver','cpf'],['vehicle','plate'],['companies','cnpj']])
      old[table] = await db.query(`SELECT * FROM ${identifier(table)} ORDER BY ${identifier(key)} FOR UPDATE`);
    const backupFile = path.join(dir, `backup-${stamp}.json`);
    fs.writeFileSync(backupFile, json({ createdAt: stamp, database: process.env.DATABASE_NAME, sourceSha256: source.sha256, tables: old }), { flag: 'wx' });
    const preserved = {};
    const financial = ['frete_carregamento_manifestos','frete_lancamentos','frete_notas','frete_cupons','frete_fechamentos'];
    for (const table of financial) preserved[table] = await db.query(`SELECT * FROM ${identifier(table)} ORDER BY id FOR UPDATE`);
    const refs = { driver: new Set(), vehicle: new Set() };
    const fks = await db.query("SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IN ('driver','vehicle')");
    for (const fk of fks) {
      const rows = await db.query(`SELECT ${identifier(fk.COLUMN_NAME)} AS ref FROM ${identifier(fk.TABLE_NAME)} WHERE ${identifier(fk.COLUMN_NAME)} IS NOT NULL FOR UPDATE`);
      for (const row of rows) refs[fk.REFERENCED_TABLE_NAME].add(String(row.ref));
    }
    // Also preserve plate lookups for financial history stored without a foreign key.
    for (const table of financial) for (const row of preserved[table]) if (row.placa) refs.vehicle.add(row.placa);
    const companies = new Set((await db.query('SELECT sigla FROM frete_empresas')).map(c => c.sigla));
    const types = new Set((await db.query('SELECT codVehicleType FROM vehicleType')).map(t => Number(t.codVehicleType)));
    const administrators = await db.query('SELECT cod FROM employees WHERE isAdmin=1 ORDER BY cod LIMIT 1');
    if (!administrators.length) throw new Error('Não há usuário administrativo para autoria da importação.');
    const author = administrators[0].cod;
    const driverIssues = new Set(plan.issues.filter(i => i.entity === 'Motoristas').map(i => i.identifier));
    const vehicleIssues = new Set(plan.issues.filter(i => i.entity === 'Veículos').map(i => i.identifier));
    const drivers = source.drivers.filter(d => !driverIssues.has(d.cpf));
    const vehicles = [], extraIssues = [], newOwners = [];
    const owners = new Set(old.companies.map(c => c.cnpj));
    for (const v of source.vehicles.filter(v => !vehicleIssues.has(v.plate))) {
      if (!companies.has(v.empresa_sigla) || !types.has(Number(v.type_code))) throw new Error('Catálogo alterado desde a conferência.');
      if (!owners.has(v.owner)) {
        // Use database collation to detect duplicate owner names exactly as the FK table does.
        const nameConflict = await db.query('SELECT cnpj FROM companies WHERE fantasy_name=?', [v.owner_name]);
        if (nameConflict.length) {
          extraIssues.push({ entity: 'Veículos', row: v.source_row, identifier: v.plate,
            field: 'E/J: Proprietário', reason: 'Nome de proprietário já cadastrado com outro documento' });
          continue;
        }
        await db.query('INSERT INTO companies (cnpj,fantasy_name) VALUES (?,?)', [v.owner,v.owner_name]);
        owners.add(v.owner);
        newOwners.push(v.owner);
      }
      vehicles.push(v);
    }
    for (const d of drivers) await db.query(
      'INSERT INTO driver (cpf,name,user,empresa_sigla) VALUES (?,?,?,NULL) ON DUPLICATE KEY UPDATE name=VALUES(name),empresa_sigla=NULL',
      [d.cpf,d.name,author]);
    for (const v of vehicles) await db.query(
      'INSERT INTO vehicle (plate,codVehicleType,owner,owner_name,empresa_sigla,first_payer,second_payer,second_payer_percent,canceled,user) VALUES (?,?,?,?,?,?,NULL,0,?,?) ON DUPLICATE KEY UPDATE codVehicleType=VALUES(codVehicleType),owner=VALUES(owner),owner_name=VALUES(owner_name),empresa_sigla=VALUES(empresa_sigla),first_payer=VALUES(first_payer),second_payer=NULL,second_payer_percent=0,canceled=VALUES(canceled)',
      [v.plate,Number(v.type_code),v.owner,v.owner_name,v.empresa_sigla,v.empresa_sigla,v.canceled ? 1 : 0,author]);
    const target = { driver: new Set(drivers.map(d => String(BigInt(d.cpf)))), vehicle: new Set(vehicles.map(v => v.plate)) };
    const removed = { driver: [], vehicle: [] }, retained = { driver: [], vehicle: [] };
    for (const [table,key] of [['driver','cpf'],['vehicle','plate']]) for (const row of old[table]) {
      const value = String(row[key]);
      if (target[table].has(value)) continue;
      if (refs[table].has(value)) { retained[table].push(value); continue; }
      await db.query(`DELETE FROM ${identifier(table)} WHERE ${identifier(key)}=?`, [value]);
      removed[table].push(value);
    }
    for (const table of financial) {
      const after = await db.query(`SELECT * FROM ${identifier(table)} ORDER BY id`);
      if (digest(after) !== digest(preserved[table])) throw new Error(`Dados financeiros alterados: ${table}`);
    }
    const afterDrivers = await db.query('SELECT cpf,name,empresa_sigla FROM driver');
    const afterVehicles = await db.query('SELECT plate,codVehicleType,owner,owner_name,empresa_sigla,first_payer,second_payer,second_payer_percent,canceled FROM vehicle');
    if (afterDrivers.length !== drivers.length + retained.driver.length || afterVehicles.length !== vehicles.length + retained.vehicle.length)
      throw new Error('Contagem final não confere.');
    for (const d of drivers) {
      const actual = afterDrivers.find(row => String(row.cpf) === String(BigInt(d.cpf)));
      if (!actual || actual.name !== d.name || actual.empresa_sigla !== null) throw new Error('Conferência de motorista falhou.');
    }
    for (const v of vehicles) {
      const actual = afterVehicles.find(row => row.plate === v.plate);
      if (!actual || actual.owner !== v.owner || actual.owner_name !== v.owner_name || actual.empresa_sigla !== v.empresa_sigla ||
        actual.first_payer !== v.empresa_sigla || actual.second_payer !== null || Number(actual.second_payer_percent) !== 0 ||
        actual.codVehicleType !== Number(v.type_code) || Boolean(actual.canceled) !== v.canceled) throw new Error('Conferência de veículo falhou.');
    }
    const skipped = source.vehicles.filter(v => !target.vehicle.has(v.plate));
    const report = { mode: apply ? 'apply' : 'rollback', sourceSha256: source.sha256, backupFile, author,
      imported: { drivers: drivers.length, vehicles: vehicles.length },
      skippedVehicles: skipped, issues: [...plan.issues, ...extraIssues], removed, retained, newOwners,
      finalCounts: { drivers: afterDrivers.length, vehicles: afterVehicles.length },
      financialUnchanged: true, financialCounts: Object.fromEntries(financial.map(t => [t,preserved[t].length])) };
    fs.writeFileSync(reportFile, json(report), { flag: 'wx' });
    if (apply) { await db.commit(); committed = true; }
    else await db.rollback();
    fs.writeFileSync(reportFile + '.status', apply ? 'COMMITTED' : 'ROLLED_BACK', { flag: 'wx' });
    console.log(json({ imported: report.imported, pendingVehicles: skipped.length, extraIssueCount: extraIssues.length,
      removed: { drivers: removed.driver.length, vehicles: removed.vehicle.length },
      retained: { drivers: retained.driver.length, vehicles: retained.vehicle.length }, finalCounts: report.finalCounts,
      newOwners: newOwners.length, financialUnchanged: true, mode: apply ? 'COMMITTED' : 'ROLLED_BACK', reportFile }));
  } catch (e) { if (!committed) await db.rollback(); throw e; }
  finally { await db.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
