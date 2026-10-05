require('dotenv/config');
const mariadb = require('mariadb');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const dir = path.resolve(process.argv[2]);
  const db = await mariadb.createConnection({ host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 3306), user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD, database: process.env.DATABASE_NAME, dateStrings: true });
  const stringify = v => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? String(x) : x, 2);
  try {
    const backup = { createdAt: new Date().toISOString(), database: process.env.DATABASE_NAME, tables: {} };
    for (const table of ['driver', 'vehicle', 'companies']) {
      const ddl = await db.query(`SHOW CREATE TABLE \`${table}\``);
      backup.tables[table] = { ddl: ddl[0]['Create Table'], rows: await db.query(`SELECT * FROM \`${table}\``) };
    }
    const backupFile = path.join(dir, 'backup-before-import.json');
    fs.writeFileSync(backupFile, stringify(backup), { flag: 'wx' });
    const foreignKeys = await db.query(`SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND (TABLE_NAME IN ('driver','vehicle','companies') OR REFERENCED_TABLE_NAME IN ('driver','vehicle','companies')) AND REFERENCED_TABLE_NAME IS NOT NULL`);
    const types = await db.query('SELECT codVehicleType,typeName,max_m3,max_weight,freight_value FROM vehicleType');
    const companies = await db.query('SELECT sigla,nome FROM frete_empresas');
    const triggers = await db.query('SHOW TRIGGERS');
    const employees = await db.query('SELECT cod,unit,isAdmin FROM employees ORDER BY cod');
    const counts = {};
    for (const table of ['frete_carregamento_manifestos','frete_lancamentos','frete_notas','frete_cupons','frete_fechamentos']) {
      counts[table] = (await db.query(`SELECT COUNT(*) AS total FROM \`${table}\``))[0].total;
    }
    const report = { counts, backupRows: Object.fromEntries(Object.entries(backup.tables).map(([k,v]) => [k,v.rows.length])),
      foreignKeys, types, companies, employees, triggers: triggers.map(t => ({ table: t.Table, trigger: t.Trigger })) };
    fs.writeFileSync(path.join(dir,'database-audit.json'), stringify(report));
    console.log(stringify(report));
  } finally { await db.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
