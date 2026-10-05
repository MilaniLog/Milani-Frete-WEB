// Additive and idempotent: existing vehicles keep an empty optional driver.
require('dotenv').config({ quiet: true });
const mariadb = require('mariadb');
(async () => {
  const db = await mariadb.createConnection({ host:process.env.DATABASE_HOST, port:Number(process.env.DATABASE_PORT || 3306), user:process.env.DATABASE_USER, password:process.env.DATABASE_PASSWORD, database:process.env.DATABASE_NAME });
  try {
    const columns = await db.query("SHOW COLUMNS FROM vehicle LIKE 'driver_cpf'");
    if (!columns.length) await db.query('ALTER TABLE vehicle ADD COLUMN driver_cpf VARCHAR(11) NULL');
    console.log('vehicle.driver_cpf disponível; cadastros e movimentos preservados.');
  } finally { await db.end(); }
})().catch(error=>{console.error(error.code || error.message);process.exitCode=1;});
