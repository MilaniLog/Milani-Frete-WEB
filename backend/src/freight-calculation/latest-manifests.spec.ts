import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { FreightCalculationService } from './freight-calculation.service';
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../docs/latest-manifests-reference.json'), 'utf8'));
const results: any[] = [];
afterAll(() => {
  const dir = resolve(__dirname, '../../../artifacts/manifest-check-20261001');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'comparison.json'), JSON.stringify({ sha256: fixture.sha256, results }, null, 2));
});
it.each(fixture.cases)('compares Excel row $row, manifest $manifest', async (c) => {
  const service = new FreightCalculationService({ frete_regras_calculo: { findMany: async () => fixture.rules } } as any);
  const r = await service.calculate(c.input);
  const actual = { ...r.freightsCalculated, totalFretes: r.totalFretes, discounts: r.discounts, totalPay: r.totalPay,
    initPercent: r.initPercent, finalPercent: r.finalPercent, legacyNet: r.totalReceive - c.input.descarga - r.discounts };
  const differences = Object.entries(c.expected).flatMap(([field, value]) => {
    const tolerance = field.includes('Percent') ? 0.00000001 : 0.0001;
    return Math.abs(actual[field] - Number(value)) > tolerance ? [{field, excel: value, backend: actual[field]}] : [];
  });
  results.push({ row: c.row, manifest: c.manifest, date: c.date, actual, differences });
  expect(differences).toEqual([]);
  for (const field of ['freight777','freight888','freight999','notDelivery777','notDelivery888','notDelivery999','totalFretes','discounts'])
    expect(actual[field]).toBeCloseTo(c.expected[field], 4);
});
