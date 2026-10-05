// Read-only source, transactional import; defaults to rollback rehearsal.
require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const mariadb = require('mariadb');
const dir = path.resolve(process.argv[2]);
const unit = Number(process.argv[3]);
const apply = process.argv.includes('--apply');
if (!Number.isInteger(unit) || unit < 1) throw new Error('Unidade inválida');
const source = JSON.parse(fs.readFileSync(path.join(dir,'destinos.json'),'utf8'));
const json = v => JSON.stringify(v, (_,x) => typeof x === 'bigint' ? String(x) : x, 2);
const hash = v => createHash('sha256').update(json(v)).digest('hex');
const ident = s => { if (!/^[a-zA-Z0-9_]+$/.test(s)) throw new Error('Identificador inválido'); return '`' + s + '`'; };
async function main() {
  if (createHash('sha256').update(fs.readFileSync(source.source)).digest('hex') !== source.sha256) throw new Error('Planilha alterada; exporte novamente');
  const db = await mariadb.createConnection({ host:process.env.DATABASE_HOST,port:Number(process.env.DATABASE_PORT||3306),
    user:process.env.DATABASE_USER,password:process.env.DATABASE_PASSWORD,database:process.env.DATABASE_NAME,dateStrings:true,charset:'utf8mb4' });
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  try {
    const engine = await db.query("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='frete_destinos'");
    if (engine[0]?.ENGINE !== 'InnoDB') throw new Error('Tabela não transacional');
    if ((await db.query('SHOW TRIGGERS')).some(t => t.Table === 'frete_destinos')) throw new Error('Trigger requer revisão');
    if (!(await db.query('SELECT cod FROM employees WHERE unit=? LIMIT 1',[unit])).length) throw new Error('Unidade sem usuários');
    await db.beginTransaction();
    const before = await db.query('SELECT * FROM frete_destinos ORDER BY id FOR UPDATE');
    const financial = {};
    for (const table of ['frete_carregamento_manifestos','frete_lancamentos','frete_notas','frete_cupons','frete_fechamentos'])
      financial[table] = await db.query(`SELECT * FROM ${ident(table)} ORDER BY id FOR UPDATE`);
    const backupFile = path.join(dir,`backup-${stamp}.json`);
    fs.writeFileSync(backupFile,json({ database:process.env.DATABASE_NAME,unit,sourceSha256:source.sha256,
      ddl:(await db.query('SHOW CREATE TABLE frete_destinos'))[0]['Create Table'],rows:before }),{flag:'wx'});
    const referenced = new Set();
    const fks = await db.query("SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='frete_destinos'");
    for (const fk of fks) for (const row of await db.query(`SELECT ${ident(fk.COLUMN_NAME)} AS ref FROM ${ident(fk.TABLE_NAME)} FOR UPDATE`)) referenced.add(Number(row.ref));
    const selected = new Set(), duplicates = [], pending = [], created = [];
    for (const row of source.rows) {
      if (!row.nome || row.nome.length > 150) { pending.push(row); continue; }
      const existing = await db.query('SELECT id FROM frete_destinos WHERE unit=? AND nome=? ORDER BY id LIMIT 1',[unit,row.nome]);
      let id;
      if (existing.length) {
        id = existing[0].id;
        if (selected.has(id)) { duplicates.push(row); continue; }
        await db.query('UPDATE frete_destinos SET nome=?,ativo=1,updated_at=NOW() WHERE id=? AND unit=?',[row.nome,id,unit]);
      } else {
        const inserted = await db.query('INSERT INTO frete_destinos (unit,nome,ativo,created_at,updated_at) VALUES (?,?,1,NOW(),NOW())',[unit,row.nome]);
        id = Number(inserted.insertId); created.push(id);
      }
      selected.add(id);
    }
    const retained = [], removed = [];
    for (const old of before.filter(d => d.unit === unit && !selected.has(d.id))) {
      const historical = await db.query('SELECT id FROM frete_carregamento_manifestos WHERE unit=? AND destino=? LIMIT 1',[unit,old.nome]);
      const entries = await db.query('SELECT id FROM frete_lancamentos WHERE unit=? AND destino=? LIMIT 1',[unit,old.nome]);
      if (referenced.has(old.id) || historical.length || entries.length) { retained.push(old); continue; }
      await db.query('DELETE FROM frete_destinos WHERE id=? AND unit=?',[old.id,unit]); removed.push(old);
    }
    const after = await db.query('SELECT * FROM frete_destinos ORDER BY id');
    if (hash(before.filter(d => d.unit !== unit)) !== hash(after.filter(d => d.unit !== unit))) throw new Error('Outra unidade alterada');
    for (const [table,rows] of Object.entries(financial))
      if (hash(rows) !== hash(await db.query(`SELECT * FROM ${ident(table)} ORDER BY id`))) throw new Error('Movimentos alterados');
    const expected = after.filter(d => selected.has(d.id));
    if (expected.length !== selected.size || expected.some(d => !d.ativo)) throw new Error('Conferência dos destinos falhou');
    const report = { mode:apply?'COMMITTED':'ROLLED_BACK',unit,sourceSha256:source.sha256,backupFile,
      sourceRows:source.rows.length,imported:selected.size,created:created.length,duplicates,pending,
      removed,retained,finalRows:after.filter(d => d.unit === unit),financialUnchanged:true,
      financialHashes:Object.fromEntries(Object.entries(financial).map(([k,v])=>[k,hash(v)])) };
    const reportFile = path.join(dir,`import-${stamp}.json`);
    fs.writeFileSync(reportFile,json(report),{flag:'wx'});
    if (apply) await db.commit(); else await db.rollback();
    fs.writeFileSync(reportFile+'.status',report.mode,{flag:'wx'});
    if (apply) {
      const saved = await db.query('SELECT * FROM frete_destinos WHERE unit=? ORDER BY id',[unit]);
      if (hash(saved) !== hash(report.finalRows)) throw new Error('Divergência após commit; consultar relatório');
    }
    console.log(json({mode:report.mode,unit,imported:report.imported,created:report.created,duplicates:duplicates.length,
      pending:pending.length,removed:removed.length,retained:retained.length,finalCount:report.finalRows.length,financialUnchanged:true,reportFile}));
  } catch(e) { await db.rollback(); throw e; } finally { await db.end(); }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
