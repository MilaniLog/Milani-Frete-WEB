import 'dotenv/config';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const db = new PrismaService();
  const week = '4126';
  const base = Number(week) * 10000;
  const range = { gte: base + 1, lte: base + 9999 };
  const targetBranches = ['SSA', 'VIX'];
  const targetUnits = (
    await db.branches.findMany({
      where: { branch: { in: targetBranches } },
      select: { unit: true },
    })
  ).map(({ unit }) => unit);
  const spUnits = (
    await db.branches.findMany({
      where: { branch: 'SP' },
      select: { unit: true },
    })
  ).map(({ unit }) => unit);
  const [spLast, targetManifests] = await Promise.all([
    db.frete_carregamento_manifestos.findFirst({
      where: { unit: { in: spUnits }, num_fechamento: range },
      orderBy: { num_fechamento: 'desc' },
      select: { num_fechamento: true },
    }),
    db.frete_carregamento_manifestos.findMany({
      where: { unit: { in: targetUnits }, num_fechamento: range },
      orderBy: { id: 'asc' },
      select: { id: true, unit: true, placa: true, num_fechamento: true },
    }),
  ]);
  const groups = new Map<
    string,
    { unit: number; placa: string; oldNumber: number; firstId: number }
  >();
  for (const row of targetManifests) {
    const key = `${row.unit}:${row.placa}`;
    const oldNumber = row.num_fechamento;
    if (oldNumber == null) continue;
    const current = groups.get(key);
    if (current && current.oldNumber !== oldNumber)
      throw new Error(`A placa ${row.placa} possui mais de um numero na semana.`);
    if (!current)
      groups.set(key, {
        unit: row.unit,
        placa: row.placa,
        oldNumber,
        firstId: row.id,
      });
  }
  const start = (spLast?.num_fechamento ?? base) + 1;
  const changes = [...groups.values()]
    .sort((a, b) => a.firstId - b.firstId)
    .map((group, index) => ({ ...group, newNumber: start + index }));

  if (process.argv.includes('--apply')) {
    await db.$transaction(async (tx) => {
      for (const change of changes) {
        await tx.frete_carregamento_manifestos.updateMany({
          where: {
            unit: change.unit,
            placa: change.placa,
            num_fechamento: change.oldNumber,
          },
          data: { num_fechamento: change.newNumber },
        });
        await tx.frete_fechamentos.updateMany({
          where: { semana: week, unit: change.unit, placa: change.placa },
          data: { numero: change.newNumber },
        });
      }
    });
  }
  const weekRows = await db.frete_carregamento_manifestos.findMany({
    where: { num_fechamento: range },
    select: { num_fechamento: true, unit: true, placa: true },
  });
  const ownersByNumber = new Map<number, Set<string>>();
  for (const row of weekRows) {
    if (row.num_fechamento == null) continue;
    const owners = ownersByNumber.get(row.num_fechamento) ?? new Set<string>();
    owners.add(`${row.unit}:${row.placa}`);
    ownersByNumber.set(row.num_fechamento, owners);
  }
  const duplicateNumbers = [...ownersByNumber]
    .filter(([, owners]) => owners.size > 1)
    .map(([numero, owners]) => ({ numero, owners: [...owners] }));
  console.log(
    JSON.stringify(
      {
        mode: process.argv.includes('--apply') ? 'applied' : 'preview',
        preservedSpThrough: spLast?.num_fechamento ?? base,
        changes,
        duplicateNumbers,
      },
      null,
      2,
    ),
  );
  await db.$disconnect();
}

void main();
