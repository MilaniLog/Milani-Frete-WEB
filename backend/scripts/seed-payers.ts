import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { Decimal } from '@prisma/client/runtime/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { allocatePayment } from '../src/freight-closures/payment-allocation';

async function main() {
  const source = JSON.parse(readFileSync('../referencias/vba/payers.json','utf8')) as {
    plate:string; first_payer:string; first_percent:string; second_payer:string; second_payer_percent:string;
  }[];
  const apply = process.argv.includes('--apply');
  const db = new PrismaService();
  try {
    const result = await db.$transaction(async tx => {
      const missing:string[] = [], canceled:string[] = [], changes:any[] = [];
      const seen = new Map<string,string>();
      let same = 0;
      for (const row of source) {
        if (seen.has(row.plate)) {
          if (seen.get(row.plate) !== JSON.stringify(row)) throw new Error('Conflicting duplicate source plate');
          continue;
        }
        seen.set(row.plate,JSON.stringify(row));
        const data = {first_payer:row.first_payer || null,second_payer:row.second_payer || null,
          second_payer_percent:new Decimal(row.second_payer_percent || 0)};
        if ((data.first_payer?.length ?? 0)>30 || (data.second_payer?.length ?? 0)>30) throw new Error('Payer name too long');
        allocatePayment(new Decimal(0), data, []);
        if (!new Decimal(row.first_percent || 0).plus(data.second_payer_percent).equals(1)) throw new Error('Source rates do not total 100%');
        const current = await tx.vehicle.findUnique({where:{plate:row.plate}});
        if (!current) {missing.push(row.plate); continue;}
        if (current.canceled) {canceled.push(row.plate); continue;}
        if (current.first_payer === data.first_payer && current.second_payer === data.second_payer && current.second_payer_percent.equals(data.second_payer_percent)) {same++; continue;}
        changes.push({plate:row.plate,before:{first_payer:current.first_payer,second_payer:current.second_payer,second_payer_percent:current.second_payer_percent.toString()},after:data});
      }
      // Keep the complete review/backup local, without printing vehicle identifiers.
      if (apply && changes.length) {
        writeFileSync(`../referencias/vba/payers-backup-${Date.now()}.json`,JSON.stringify(changes,null,2));
        for (const change of changes) await tx.vehicle.update({where:{plate:change.plate,canceled:false},data:change.after});
      }
      writeFileSync('../referencias/vba/payers-import-report.json',JSON.stringify({missing,canceled,changes},null,2));
      return {mode:apply?'aplicado':'previa',source:source.length,updated:changes.length,unchanged:same,missing:missing.length,canceled:canceled.length};
    },{isolationLevel:'Serializable',timeout:60000});
    console.log(JSON.stringify(result));
  } finally {await db.$disconnect();}
}
main().catch(e => {console.error(e.message);process.exitCode=1;});
