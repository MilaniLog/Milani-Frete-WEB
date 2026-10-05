require('dotenv/config');
const mariadb = require('mariadb');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const reportFile = path.resolve(process.argv[2]);
assert.equal(fs.readFileSync(reportFile + '.status', 'utf8'), 'COMMITTED');
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
const dir = path.dirname(reportFile);
const source = JSON.parse(fs.readFileSync(path.join(dir, 'registrations.json'), 'utf8'));
async function main() {
  const db = await mariadb.createConnection({ host: process.env.DATABASE_HOST, port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD, database: process.env.DATABASE_NAME, dateStrings: true });
  try {
    const drivers = await db.query('SELECT cpf,name,empresa_sigla FROM driver');
    const vehicles = await db.query('SELECT plate,codVehicleType,owner,owner_name,empresa_sigla,first_payer,second_payer,second_payer_percent,canceled FROM vehicle');
    assert.equal(drivers.length, report.finalCounts.drivers);
    assert.equal(vehicles.length, report.finalCounts.vehicles);
    for (const d of source.drivers) {
      const saved = drivers.find(r => String(r.cpf) === String(BigInt(d.cpf)));
      assert(saved);
      assert.equal(saved.name, d.name);
      assert.equal(saved.empresa_sigla, null);
    }
    const skipped = new Set(report.skippedVehicles.map(v => v.plate));
    const importedVehicles = source.vehicles.filter(v => !skipped.has(v.plate));
    for (const v of importedVehicles) {
      const saved = vehicles.find(r => r.plate === v.plate);
      assert(saved);
      assert.equal(saved.owner, v.owner);
      assert.equal(saved.owner_name, v.owner_name);
      assert.equal(saved.codVehicleType, Number(v.type_code));
      assert.equal(saved.empresa_sigla, v.empresa_sigla);
      assert.equal(saved.first_payer, v.empresa_sigla);
      assert.equal(saved.second_payer, null);
      assert.equal(Number(saved.second_payer_percent), 0);
      assert.equal(Boolean(saved.canceled), v.canceled);
    }
    for (const [table,count] of Object.entries(report.financialCounts)) {
      assert(/^[a-z_]+$/.test(table));
      assert.equal(Number((await db.query(`SELECT COUNT(*) AS n FROM \`${table}\``))[0].n), count);
    }
    const q = v => '"' + String(v ?? '').replaceAll('"','""') + '"';
    const csv = rows => '\ufeff' + rows.map(row => row.map(q).join(';')).join('\r\n');
    fs.writeFileSync(path.join(dir,'pendencias.csv'), csv([
      ['Cadastro','Linha Excel','Identificador','Coluna','Pendência'],
      ...report.issues.map(i => [i.entity,i.row,i.identifier,i.field,i.reason]),
    ]), 'utf8');
    fs.writeFileSync(path.join(dir,'veiculos-importados.csv'), csv([
      ['Linha Excel','Placa','Tipo','Empresa','Cancelado'],
      ...importedVehicles.map(v => [v.source_row,v.plate,v.type_code,v.empresa_sigla,v.canceled ? 'Sim' : 'Não']),
    ]), 'utf8');
    const verified = { verifiedAt: new Date().toISOString(), imported: report.imported,
      finalCounts: report.finalCounts, pendingVehicles: skipped.size, financialCounts: report.financialCounts };
    fs.writeFileSync(path.join(dir,'verification.json'), JSON.stringify(verified,null,2));
    console.log(JSON.stringify(verified,null,2));
  } finally { await db.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
