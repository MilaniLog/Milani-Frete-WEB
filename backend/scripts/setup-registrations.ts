import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaService } from '../src/prisma/prisma.service';
async function main() {
  const db = new PrismaService();
  try {
    const source = JSON.parse(
      readFileSync('../referencias/vba/companies.json', 'utf8'),
    ) as { sigla: string; matriz: string; nome: string; cor: string }[];
    if (source.length !== 11 || new Set(source.map((c) => c.sigla)).size !== 11)
      throw new Error('Expected 11 distinct companies');
    await db.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS frete_empresas (sigla VARCHAR(10) PRIMARY KEY, matriz VARCHAR(20) NOT NULL, nome VARCHAR(100) NOT NULL, cor VARCHAR(20) NOT NULL) ENGINE=InnoDB',
    );
    for (const [table, column, type] of [
      ['driver', 'empresa_sigla', 'VARCHAR(10)'],
      ['vehicle', 'empresa_sigla', 'VARCHAR(10)'],
      ['vehicle', 'owner_name', 'VARCHAR(50)'],
    ]) {
      const rows = await db.$queryRaw<
        any[]
      >`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=${table} AND COLUMN_NAME=${column}`;
      if (!rows.length)
        await db.$executeRawUnsafe(
          `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type} NULL`,
        );
    }
    await db.$transaction(async (tx) => {
      for (const row of source) {
        const existing = await tx.frete_empresas.findUnique({
          where: { sigla: row.sigla },
        });
        if (
          existing &&
          (existing.nome !== row.nome ||
            existing.matriz !== row.matriz ||
            existing.cor !== row.cor)
        )
          throw new Error('Company catalog conflict');
        if (!existing) await tx.frete_empresas.create({ data: row });
      }
    });
    console.log(
      '11 empresas conferidas; estrutura de cadastros preparada. Nenhum rateio importado.',
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
