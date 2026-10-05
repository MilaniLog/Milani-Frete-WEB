import 'dotenv/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { calendarYear } from '../src/weeks/calendar';

// Explicitly requested operational calendar. Existing rows are never changed.
async function main() {
  const db = new PrismaService();
  const planned = [...calendarYear(2026), ...calendarYear(2027)];
  const apply = process.argv.includes('--apply');
  try {
    const result = await db.$transaction(
      async (tx) => {
        const existing = await tx.frete_semanas.findMany();
        const missing = planned.filter((week) => {
          const same = existing.find((row) => row.codigo === week.codigo);
          if (same) {
            if (
              same.data_inicio.getTime() !== week.data_inicio.getTime() ||
              same.data_fim.getTime() !== week.data_fim.getTime()
            )
              throw new Error(
                `Código ${week.codigo} possui datas diferentes; nenhuma alteração aplicada.`,
              );
            return false;
          }
          return true;
        });
        for (const week of missing) {
          const overlap = existing.find(
            (row) =>
              row.data_inicio <= week.data_fim &&
              row.data_fim >= week.data_inicio,
          );
          if (overlap)
            throw new Error(
              `Semana ${week.codigo} sobrepõe ${overlap.codigo}; nenhuma alteração aplicada.`,
            );
        }
        if (apply && missing.length)
          await tx.frete_semanas.createMany({ data: missing });
        return {
          mode: apply ? 'aplicado' : 'previa',
          previstos: planned.length,
          existentes: planned.length - missing.length,
          novos: missing.length,
          primeiro: planned[0],
          exemplo: planned.find((week) => week.codigo === '3926'),
          virada: planned.filter((week) =>
            ['5326', '0127'].includes(week.codigo),
          ),
          ultimo: planned[planned.length - 1],
        };
      },
      { isolationLevel: 'Serializable' },
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
