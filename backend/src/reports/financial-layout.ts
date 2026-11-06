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
      (g) => g.origin === 'Vale' && g.code === code,
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
  'ID LANÇ',
  'DATA',
  'PLACA',
  'MOTORISTA',
  'MANIF/NF',
  'COD',
  'TIPO',
  'DESCRIÇÃO',
  'D/C',
  'VALOR',
  'Nº FECH. VALE',
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
  r[13] == null ? '' : String(r[13]).padStart(6, '0'),
];

function valeByPlateHtml(
  r: TableReport,
  escape: (v: unknown) => string,
) {
  const groups = new Map<string, Cell[][]>();
  for (const row of r.rows) {
    const plate = String(row[3] ?? 'SEM PLACA');
    groups.set(plate, [...(groups.get(plate) ?? []), row]);
  }
  const currency = (value: Cell) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  const sections = [...groups.entries()]
    .map(([plate, rows]) => {
      const total = rows.reduce(
        (sum, row) =>
          String(row[6] ?? '').trim() === '3333'
            ? sum
            : sum.plus(String(row[10] ?? 0)),
        new Decimal(0),
      );
      const details = r.plateDetails?.[plate];
      const driver = details?.driver ?? rows.find((row) => row[4])?.[4] ?? '';
      const heading = [plate, details?.vehicleType, driver].filter(Boolean).join(' · ');
      const categorized = [
        ['CRÉDITOS', rows.filter((row) => row[9] === 'Credito')],
        ['DÉBITOS', rows.filter((row) => row[9] === 'Debito' && String(row[6] ?? '').trim() !== '3333')],
        ['CTRB', rows.filter((row) => String(row[6] ?? '').trim() === '3333' || !['Credito', 'Debito'].includes(String(row[9] ?? '')))],
      ].filter(([, sectionRows]) => sectionRows.length > 0) as [string, Cell[][]][];
      const tables = categorized.map(([title, sectionRows]) => {
        const sectionTotal = sectionRows.reduce(
          (sum, row) => sum.plus(String(row[10] ?? 0)),
          new Decimal(0),
        );
        const body = sectionRows.map((row) => `<tr><td>${escape(row[2] ?? '')}</td><td>${escape(row[1] ?? '')}</td><td>${escape(row[5] ?? '')}</td><td>${escape(String(row[6] ?? '').trim() === '3333' ? 'CTRB' : row[9] ?? 'Vale')}</td><td>${escape(`${row[6] ?? ''}${row[7] ? ` - ${row[7]}` : ''}`)}</td><td>${escape(row[8] ?? '')}</td><td>${escape(row[12] ?? '')}</td><td class="value">${currency(row[10])}</td></tr>`).join('');
        return `<h3>${title}</h3><table><colgroup>${[9, 8, 13, 7, 20, 22, 8, 13].map((width) => `<col style="width:${width}%">`).join('')}</colgroup><thead><tr><th>DATA</th><th>ID VALE</th><th>MANIFESTO</th><th>TIPO</th><th>DESPESA</th><th>DESCRIÇÃO</th><th>USUÁRIO</th><th class="value">VALOR</th></tr></thead><tbody>${body}</tbody><tfoot><tr><th colspan="7">TOTAL DE ${title}</th><th class="value">${currency(sectionTotal.toFixed(2))}</th></tr></tfoot></table>`;
      }).join('');
      return `<section class="plate"><h2>${escape(heading)}</h2>${tables}<div class="plate-total"><strong>TOTAL DA PLACA</strong><span>${currency(total.toFixed(2))}</span></div></section>`;
    })
    .join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escape(r.title)}</title><style>
@page{size:A4 landscape;margin:10mm 10mm 14mm;@bottom-center{content:"Página " counter(page) " de " counter(pages);font:8pt Arial}}body{font:8pt Arial;color:#111;background:#fff;margin:0}h1{text-align:center;font-size:12pt;margin:0 0 10px}.metadata{font-size:9pt;margin:6px 0 12px}.metadata p{margin:3px 0}.plate{margin:0 0 12px;break-inside:auto}.plate h2{font-size:10pt;background:#e6e6e6;border:1px solid #aaa;padding:6px 8px;margin:0;break-after:avoid}.plate h3{font-size:8pt;background:#f1f1f1;border:1px solid #ccc;border-bottom:0;padding:4px 6px;margin:7px 0 0;break-after:avoid}.plate table{width:100%;border-collapse:collapse;table-layout:fixed}.plate th,.plate td{padding:4px 3px;border-bottom:1px solid #ddd;text-align:left;overflow-wrap:anywhere;font-weight:normal}.plate thead th,.plate tfoot th{font-weight:bold;background:#f3f3f3}.plate tr{break-inside:avoid}.plate .value{text-align:right;white-space:nowrap}.empty-row{text-align:center!important;color:#777}.plate-total{display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:8px 9px;border-top:3px solid #555;background:#e9edf1;font-size:11pt;break-inside:avoid}.plate-total span{white-space:nowrap;font-weight:bold;font-size:12pt}.screen{font-size:8pt}.empty{padding:12px;text-align:center}@media print{.screen{display:none}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><h1>${escape(r.title.toUpperCase())}</h1><div class="metadata">${r.notes.map((note) => `<p>${escape(note)}</p>`).join('')}</div><p class="screen">Ctrl+P para imprimir ou salvar em PDF.</p>${sections || '<p class="empty">Nenhum registro encontrado.</p>'}</body></html>`;
}

export function financialHtml(r: TableReport, escape: (v: unknown) => string) {
  if (r.financialKind === 'entries') return valeByPlateHtml(r, escape);
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
@page{size:A4 landscape;margin:10mm 10mm 14mm;@bottom-center{content:"Página " counter(page) " de " counter(pages);font:8pt Arial}}body{font:8pt Arial;color:#111;background:white;margin:0}h1{text-align:center;font-size:12pt;margin:0 0 14px}.metadata{font-size:9pt;margin:8px 0 16px}.metadata p{margin:4px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:5px 3px;text-align:left;overflow-wrap:anywhere;font-weight:normal}thead{display:table-header-group}thead th{font-weight:bold}.value{text-align:right;white-space:nowrap}.group th{background:#e6e6e6;font-weight:bold}.group{break-after:avoid}.subtotal td{background:#efefef;font-weight:bold}.subtotal td:first-child{text-align:right}tr{break-inside:avoid}.summary{width:60%;margin:18px 0 0 auto;break-inside:avoid}.summary th{font-weight:bold;background:#e6e6e6}.summary .total{font-weight:bold;background:#eee}.notes{font-size:8pt;margin-top:12px}@media print{.screen{display:none}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><h1>${escape(r.title.toUpperCase())}</h1><div class="metadata">${r.notes.map((n) => `<p>${escape(n)}</p>`).join('')}</div><p class="screen">Ctrl+P para imprimir ou salvar em PDF.</p><table><colgroup>${[5, 7, 7, 10, 9, 5, 16, 15, 4, 10, 12].map((w) => `<col style="width:${w}%">`).join('')}</colgroup><thead><tr>${columns.map((c) => `<th>${escape(c)}</th>`).join('')}</tr></thead><tbody>${
    layout.groups
      .map(
        (g) =>
          `<tr class="group"><th colspan="11">TIPO: ${escape(g.code)} - ${escape(g.name)}${g.origin === 'Cupom' ? ' (CUPONS)' : ''}</th></tr>${g.rows
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
            )}<tr class="subtotal"><td colspan="9">SUBTOTAL</td><td class="value">${currency(g.total)}</td><td></td></tr>`,
      )
      .join('') || '<tr><td colspan="11">Nenhum registro encontrado.</td></tr>'
  }</tbody></table><table class="summary"><colgroup><col style="width:16%"><col style="width:60%"><col style="width:24%"></colgroup><thead><tr><th>CÓDIGO</th><th>DESCRIÇÃO</th><th class="value">TOTAL</th></tr></thead><tbody>${summaries}${r.financialKind === 'coupons' ? '' : `<tr class="total"><td colspan="2">SELECIONADOS</td><td class="value">${currency(layout.selectedTotal)}</td></tr>`}<tr class="total"><td colspan="2">TOTAL GERAL</td><td class="value">${currency(layout.total)}</td></tr></tbody></table><p class="notes">${r.financialKind === 'coupons' ? '' : 'Selecionados: vales dos códigos 0002, 0003, 0004, 0005, 0006, 0011 e 3333. '}Total geral: soma dos valores exibidos. Não corresponde ao líquido do fechamento.</p></body></html>`;
}
