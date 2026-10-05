import { financialLayout, selectedCodes } from './financial-layout';
import { reportHtml, reportSpreadsheet, TableReport } from './report-render';

const report = (rows: TableReport['rows']): TableReport => ({
  title: 'Teste',
  notes: [],
  columns: [
    'Origem',
    'Lanç',
    'Data',
    'Placa',
    'Motorista',
    'Manif/NF',
    'Código',
    'Tipo',
    'Descrição',
    'D/C',
    'Valor',
    'Departamento',
    'Situação',
  ],
  rows,
  numeric: [10],
  totals: [],
});
const entry = (code: string, value: string, origin = 'Lançamento') =>
  [
    origin,
    1,
    '20/09/2026',
    'ABC1D23',
    'Motorista',
    'Avulso',
    code,
    'Tipo <teste>',
    'Descrição',
    code === '3333' ? 'Adiantamento' : 'Debito',
    value,
    '',
    '',
  ] as TableReport['rows'][number];
describe('Layout de lançamentos do Excel', () => {
  it('sempre mostra os sete códigos, inclusive com relatório vazio', () => {
    const r = report([]),
      layout = financialLayout(r);
    expect(layout.selected.map((s) => s.code)).toEqual(selectedCodes);
    expect(layout.selected.every((s) => s.total.isZero())).toBe(true);
    for (const code of selectedCodes) {
      expect(reportHtml(r)).toContain(code);
      expect(reportSpreadsheet(r)).toContain(code);
    }
  });
  it('agrupa códigos equivalentes e não mistura cupons no resumo de lançamentos', () => {
    const r = report([
      entry('004', '-0.10'),
      entry('0004', '-0.20'),
      entry('0004', '-9', 'Cupom'),
      entry('3333', '2'),
      entry('0050', '1'),
    ]);
    const l = financialLayout(r);
    expect(l.groups).toHaveLength(4);
    expect(l.selected.find((s) => s.code === '0004')?.total.toFixed(2)).toBe(
      '-0.30',
    );
    expect(l.selectedTotal.toFixed(2)).toBe('1.70');
    expect(l.total.toFixed(2)).toBe('-6.30');
    const html = reportHtml(r);
    expect(html.match(/>SUBTOTAL</g)).toHaveLength(4);
    expect(html).toContain('Tipo &lt;teste&gt;');
    expect(html).toContain('-R$ 0,30');
    expect(html).toContain('(CUPONS)');
    expect(html).toContain('Adiantamento');
    const xml = reportSpreadsheet(r);
    expect(xml).toContain('SELECIONADOS');
    expect(xml).toContain('TOTAL GERAL');
    expect(xml).toContain('ss:Type="Number">-0.30');
  });
});
