import { Decimal } from '@prisma/client/runtime/client';
import type { Cell, TableReport } from './report-render';

export const selectedCodes = [
  '0002',
  '0003',
  '0004',
  '0005',
  '0006',
  '0011',
  '3333',
];
const normalizeCode = (value: Cell) =>
  /^\d+$/.test(String(value))
    ? String(value).padStart(4, '0')
    : String(value ?? '');
export const isFinancial = (r: TableReport) =>
  r.columns[0] === 'Origem' && r.columns[6] === 'Código';
export function financialLayout(r: TableReport) {
  const groups = new Map<
    string,
    {
      code: string;
      name: string;
      origin: string;
      rows: Cell[][];
      total: Decimal;
    }
  >();
  for (const row of r.rows) {
    const code = normalizeCode(row[6]),
      origin = String(row[0] ?? ''),
      name = String(row[7] ?? '');
    const key = JSON.stringify([origin, code, name]);
    const group = groups.get(key) ?? {
      code,
      name,
      origin,
      rows: [],
      total: new Decimal(0),
    };
    group.rows.push(row);
    group.total = group.total.plus(String(row[10] ?? 0));
    groups.set(key, group);
  }
  const ordered = [...groups.values()].sort(
    (a, b) =>
      a.origin.localeCompare(b.origin) ||
      a.code.localeCompare(b.code, undefined, { numeric: true }) ||
      a.name.localeCompare(b.name),
  );
  const selected = (r.financialKind === 'coupons' ? [] : selectedCodes).map((code) => {
    const matches = ordered.filter(
      (g) => g.origin === 'Lançamento' && g.code === code,
    );
    return {
      code,
      name:
        matches
          .map((g) => g.name)
          .filter(Boolean)
          .join(' / ') || `Código ${code}`,
      total: matches.reduce((a, g) => a.plus(g.total), new Decimal(0)),
    };
  });
  return {
    groups: ordered,
    selected,
    selectedTotal: selected.reduce((a, g) => a.plus(g.total), new Decimal(0)),
    total: ordered.reduce((a, g) => a.plus(g.total), new Decimal(0)),
  };
}
export const financialColumns = [
  'LANÇ',
  'DATA',
  'PLACA',
  'MOTORISTA',
  'MANIF/NF',
  'COD',
  'TIPO',
  'DESCRIÇÃO',
  'D/C',
  'VALOR',
];
export const financialRow = (r: Cell[]): Cell[] => [
  r[1],
  r[2],
  r[3],
  r[4],
  r[5],
  normalizeCode(r[6]),
  r[7],
  r[8],
  r[9] === 'Debito' ? 'D' : r[9] === 'Credito' ? 'C' : r[9],
  r[10],
];
export function financialHtml(r: TableReport, escape: (v: unknown) => string) {
  const layout = financialLayout(r);
  const columns = financialColumns.map((name, index) =>
    r.financialKind === 'coupons' ? (index === 0 ? 'CUPOM' : index === 4 ? 'NOTA' : name) : name,
  );
  const currency = (v: Decimal | Cell) => {
    const n = new Decimal(String(v ?? 0));
    const [integer, fraction] = n
      .abs()
      .toFixed(2, Decimal.ROUND_HALF_EVEN)
      .split('.');
    return `${n.isNegative() ? '-' : ''}R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`;
  };
  const summaries = layout.selected
    .map(
      (s) =>
        `<tr><td>${escape(s.code)}</td><td>${escape(s.name)}</td><td class="value">${currency(s.total)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escape(r.title)}</title><style>
@page{size:A4 landscape;margin:9mm 8mm;@bottom-center{content:"Página " counter(page) " de " counter(pages);font:8pt Arial}}body{font:8pt Arial;color:#111;background:white;margin:0}h1{text-align:center;font-size:12pt;margin:0 0 14px}.metadata{font-size:9pt;margin:8px 0 16px}.metadata p{margin:4px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:5px 3px;text-align:left;overflow-wrap:anywhere;font-weight:normal}thead{display:table-header-group}thead th{font-weight:bold}.value{text-align:right;white-space:nowrap}.group th{background:#e6e6e6;font-weight:bold}.group{break-after:avoid}.subtotal td{background:#efefef;font-weight:bold}.subtotal td:first-child{text-align:right}tr{break-inside:avoid}.summary{width:60%;margin:18px 0 0 auto;break-inside:avoid}.summary th{font-weight:bold;background:#e6e6e6}.summary .total{font-weight:bold;background:#eee}.notes{font-size:8pt;margin-top:12px}@media print{.screen{display:none}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><h1>${escape(r.title.toUpperCase())}</h1><div class="metadata">${r.notes.map((n) => `<p>${escape(n)}</p>`).join('')}</div><p class="screen">Ctrl+P para imprimir ou salvar em PDF.</p><table><colgroup>${[6, 8, 8, 12, 10, 5, 18, 17, 5, 11].map((w) => `<col style="width:${w}%">`).join('')}</colgroup><thead><tr>${columns.map((c) => `<th>${escape(c)}</th>`).join('')}</tr></thead><tbody>${
    layout.groups
      .map(
        (g) =>
          `<tr class="group"><th colspan="10">TIPO: ${escape(g.code)} - ${escape(g.name)}${g.origin === 'Cupom' ? ' (CUPONS)' : ''}</th></tr>${g.rows
            .map(
              (r) =>
                `<tr>${financialRow(r)
                  .map(
                    (v, i) =>
                      `<td${i === 9 ? ' class="value"' : ''}>${i === 9 ? currency(v) : escape(v ?? '')}</td>`,
                  )
                  .join('')}</tr>`,
            )
            .join(
              '',
            )}<tr class="subtotal"><td colspan="9">SUBTOTAL</td><td class="value">${currency(g.total)}</td></tr>`,
      )
      .join('') || '<tr><td colspan="10">Nenhum registro encontrado.</td></tr>'
  }</tbody></table><table class="summary"><colgroup><col style="width:16%"><col style="width:60%"><col style="width:24%"></colgroup><thead><tr><th>CÓDIGO</th><th>DESCRIÇÃO</th><th class="value">TOTAL</th></tr></thead><tbody>${summaries}${r.financialKind === 'coupons' ? '' : `<tr class="total"><td colspan="2">SELECIONADOS</td><td class="value">${currency(layout.selectedTotal)}</td></tr>`}<tr class="total"><td colspan="2">TOTAL GERAL</td><td class="value">${currency(layout.total)}</td></tr></tbody></table><p class="notes">${r.financialKind === 'coupons' ? '' : 'Selecionados: lançamentos dos códigos 0002, 0003, 0004, 0005, 0006, 0011 e 3333. '}Total geral: soma dos valores exibidos. Não corresponde ao líquido do fechamento.</p></body></html>`;
}
