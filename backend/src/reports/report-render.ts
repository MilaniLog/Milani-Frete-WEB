import {
  financialColumns,
  financialHtml,
  financialLayout,
  financialRow,
  isFinancial,
} from './financial-layout';
import { xlsxWorkbook } from './xlsx';
export type Cell = string | number | null;
export type TableReport = {
  financialKind?: "entries" | "coupons" | "combined";
  printLayout?: 'compact-pairs';
  title: string;
  notes: string[];
  columns: string[];
  rows: Cell[][];
  totals: { label: string; value: string }[];
  numeric: number[];
};
export const escape = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  );
export function reportHtml(r: TableReport) {
  if (isFinancial(r)) return financialHtml(r, escape);
  const compactPairs = r.printLayout === 'compact-pairs';
  const printColumns = compactPairs
    ? Array.from({ length: 2 }, () => r.columns).flat()
    : r.columns;
  const printRows = compactPairs
    ? Array.from({ length: Math.ceil(r.rows.length / 2) }, (_, line) =>
        Array.from(
          { length: 2 },
          (_, column) => r.rows[line * 2 + column] ?? ['', ''],
        ).flat(),
      )
    : r.rows;
  const format = (v: Cell, i: number) =>
    v == null
      ? 'Não registrado'
      : r.numeric.includes(i)
        ? Number(v).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : v;
  const payments = r.columns[0] === 'EMPR';
  let company: Cell | undefined;
  const rows = printRows
    .map((row) => {
      const group =
        payments && row[0] !== company
          ? `<tr class="group"><td colspan="${r.columns.length}">EMPRESA: ${escape(row[0] ?? 'Não registrada')}</td></tr>`
          : '';
      company = row[0];
      return (
        group +
        `<tr>${row.map((v, i) => `<td class="${r.numeric.includes(i) ? 'number' : ''} ${payments && i === 10 ? 'payable' : ''}">${escape(format(v, i))}</td>`).join('')}</tr>`
      );
    })
    .join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escape(r.title)}</title><style>
body{font:${compactPairs ? '10px' : '11px'} Arial,sans-serif;margin:24px;color:#111;background:white}h1{font-size:${compactPairs ? '15px' : '18px'};text-align:center;text-transform:uppercase;border:2px solid #333;padding:${compactPairs ? '7px' : '10px'};margin:0 0 8px}.metadata{border:1px solid #555;padding:6px 8px;margin-bottom:12px}.metadata p{margin:4px 0}table{border-collapse:collapse;width:100%;table-layout:${compactPairs ? 'fixed' : 'auto'}}th,td{border:1px solid #888;padding:${compactPairs ? '3px 4px' : '5px 4px'};overflow-wrap:anywhere}th{text-align:center;background:#e1e1e1;font-size:10px}td.number{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.group td{background:#eee;font-weight:bold;border-top:2px solid #555}.payable{background:#fff3b0;font-weight:bold}thead{display:table-header-group}tr{break-inside:avoid}.totals{margin:14px 0 0 auto;width:55%;break-inside:avoid}.totals th{text-align:left}.totals td{text-align:right;white-space:nowrap}.totals tr:last-child{background:#ebebeb;font-weight:bold;border-top:2px solid #333}footer{font-size:10px;margin-top:12px;color:#444}@page{size:A4 ${compactPairs ? 'portrait' : 'landscape'};margin:10mm 10mm 14mm}@media print{body{margin:0}.screen{display:none}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><h1>Milani — ${escape(r.title)}</h1><div class="metadata">${r.notes.map((n) => `<p>${escape(n)}</p>`).join('')}</div><p class="screen">Use Ctrl+P para imprimir ou salvar em PDF.</p><table><thead><tr>${printColumns.map((c) => `<th>${escape(c.toUpperCase())}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${printColumns.length}">Nenhum registro encontrado.</td></tr>`}</tbody></table><table class="totals"><tbody>${r.totals.map((t) => `<tr><th>${escape(t.label)}</th><td>${escape(Number(t.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))}</td></tr>`).join('')}</tbody></table>${compactPairs ? '' : '<footer>Valores em reais (R$). Relatório de conferência.</footer>'}</body></html>`;
}
export function reportSpreadsheet(r: TableReport) {
  if (isFinancial(r)) {
    const layout = financialLayout(r);
    // Reuse explicit String/Number cells, with the same groups and fixed summary as print.
    return reportSpreadsheet({
      ...r,
      columns: financialColumns,
      numeric: [9],
      rows: layout.groups.flatMap((g) => [
        [`TIPO: ${g.code} - ${g.name} (${g.origin})`],
        ...g.rows.map(financialRow),
        ['SUBTOTAL', '', '', '', '', '', '', '', '', g.total.toFixed(2)],
      ]),
      totals: [
        ...layout.selected.map((s) => ({
          label: `${s.code} - ${s.name}`,
          value: s.total.toFixed(2),
        })),
        ...(r.financialKind === 'coupons' ? [] : [{ label: 'SELECIONADOS', value: layout.selectedTotal.toFixed(2) }]),
        { label: 'TOTAL GERAL', value: layout.total.toFixed(2) },
        ...r.totals.filter((t) =>
          [
            'Créditos',
            'Débitos e cupons',
            'Adiantamentos (informativo)',
            'Créditos menos débitos e cupons',
          ].includes(t.label),
        ),
      ],
    });
  }
  const rows: Cell[][] = [
    [r.title],
    ...r.notes.map((note) => [note]),
    [],
    r.columns,
    ...r.rows,
    [],
    ...r.totals.map((total) => [total.label, total.value]),
  ];
  const headingRow = 2 + r.notes.length;
  const dataStart = headingRow + 1;
  const numeric = new Set<string>();
  r.rows.forEach((_, rowIndex) =>
    r.numeric.forEach((column) => numeric.add(`${dataStart + rowIndex}:${column}`)),
  );
  const totalsStart = dataStart + r.rows.length + 1;
  r.totals.forEach((_, index) => numeric.add(`${totalsStart + index}:1`));
  return xlsxWorkbook(rows, numeric, new Set([0, headingRow]));
}
export function combineHtml(reports: string[]) {
  if (!reports.length)
    return reportHtml({
      title: 'Reimpressão de fechamentos',
      notes: [],
      columns: ['Resultado'],
      rows: [],
      totals: [],
      numeric: [],
    });
  return (
    reports[0].slice(0, reports[0].indexOf('<body>') + 6) +
    reports
      .map(
        (html, i) =>
          `<section style="${i ? 'break-before:page' : ''}">${html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'))}</section>`,
      )
      .join('') +
    '</body></html>'
  );
}
