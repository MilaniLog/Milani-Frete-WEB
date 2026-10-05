import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Decimal } from '@prisma/client/runtime/client';
import { FreightClosuresService } from './freight-closures.service';

const historical = JSON.parse(
  readFileSync(join(__dirname, '../../docs/closure-reference.json'), 'utf8'),
);
const latest = JSON.parse(
  readFileSync(
    process.env.CLOSURE_REFERENCE_FILE || join(__dirname, '../../docs/latest-closures-reference.json'),
    'utf8',
  ),
);

describe('Conciliação com fechamentos reais da planilha', () => {
  it('inclui dez casos recentes em ordem de data', () => {
    expect(latest.cases).toHaveLength(10);
    const dates = latest.cases.map((row) => row.recorded_date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(latest.cases.some((row) => row.entries.length === 0)).toBe(true);
    expect(latest.cases.some((row) => row.coupons.length === 0)).toBe(true);
  });
  it.each([historical, ...latest.cases])(
    'reproduz bruto, débitos e líquido da linha $source_row',
    async (reference) => {
      const manifests = reference.manifests.map((row) => ({
        ...row,
        frete_veiculo: new Decimal(row.frete_veiculo),
        ctrb_total: new Decimal(row.ctrb_total),
      }));
      const entries = reference.entries.map((row) => ({
        ...row,
        valor: new Decimal(row.valor),
        unit: 1,
        placa: 'ABC1234',
        pago: false,
        fechamento_id: null,
      }));
      const coupons = reference.coupons.map((row) => ({
        ...row,
        valor: new Decimal(row.valor),
      }));
      // Replays the saved membership as open records. This tests actual backend
      // arithmetic, not database selection or historical vehicle configuration.
      const db: any = {
        frete_semanas: {
          findUnique: async () => ({
            codigo: '0001',
            data_inicio: new Date('2026-01-01'),
            data_fim: new Date('2026-01-07'),
          }),
        },
        frete_carregamento_manifestos: { findMany: async () => manifests },
        frete_lancamentos: { findMany: async () => entries },
        frete_cupons: { findMany: async () => coupons },
        vehicle: {
          findUnique: async () => ({
            first_payer: null,
            second_payer: null,
            second_payer_percent: new Decimal(0),
          }),
        },
      };
      db.$transaction = async (work) => work(db);
      const result = await new FreightClosuresService(db).preview(
        { semana: '0001', placa: 'ABC1234' },
        { sub: 1, cod: 1, unit: 1, isAdmin: true },
      );
      expect(result.manifests).toHaveLength(reference.manifests.length);
      expect(result.entries).toHaveLength(reference.entries.length);
      expect(result.coupons).toHaveLength(reference.coupons.length);
      const cents = (value: string) =>
        new Decimal(value).toFixed(2, Decimal.ROUND_HALF_EVEN);
      expect(result.totals.total_bruto.toFixed(2)).toBe(
        cents(reference.expected.total_bruto),
      );
      expect(result.totals.debitos.plus(result.totals.cupons).toFixed(2)).toBe(
        cents(reference.expected.total_debitos),
      );
      expect(result.totals.total_liquido.toFixed(2)).toBe(
        cents(reference.expected.total_liquido),
      );
    },
  );
});
