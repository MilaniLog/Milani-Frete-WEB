import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const source = JSON.parse(readFileSync('../referencias/vba/expenses.json', 'utf8')) as {
    unit: number; expenses: {codigo: string; nome: string; tipo: string; ativo: boolean}[];
  };
  const apply = process.argv.includes('--apply');
  const db = new PrismaService();
  try {
    console.log(JSON.stringify({sourceUnit:source.unit,sourceExpenses:source.expenses.length}));
    const unitArg = process.argv.find(a => a.startsWith('--unit='));
    if (!unitArg) return;
    const unit = Number(unitArg.split('=')[1]);
    if (!Number.isInteger(unit) || unit < 1) throw new Error('Invalid unit');
    const codes = new Set<string>();
    for (const e of source.expenses) {
      if (!e.codigo || e.codigo.length > 10 || !e.nome || e.nome.length > 120 ||
          !['Credito','Debito','Adiantamento'].includes(e.tipo) || codes.has(e.codigo))
        throw new Error('Invalid source catalog');
      codes.add(e.codigo);
    }
    const result = await db.$transaction(async tx => {
      const current = await tx.frete_despesas.findMany({where:{unit}});
      const missing = source.expenses.filter(e => {
        const found = current.find(row => row.codigo === e.codigo);
        if (found && (found.nome !== e.nome || found.tipo !== e.tipo))
          throw new Error(`Conflito no codigo ${e.codigo}; nenhuma alteracao aplicada.`);
        return !found;
      });
      if (apply && missing.length) await tx.frete_despesas.createMany({data:missing.map(e => ({...e,unit}))});
      return {unit,mode:apply?'aplicado':'previa',novos:missing.length,existentes:source.expenses.length-missing.length};
    }, {isolationLevel:'Serializable'});
    console.log(JSON.stringify(result));
  } finally { await db.$disconnect(); }
}
main().catch(e => { console.error(e.message); process.exitCode=1; });
