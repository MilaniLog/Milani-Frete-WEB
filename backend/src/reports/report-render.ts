import {
  financialColumns,
  financialHtml,
  financialLayout,
  financialRow,
  isFinancial,
} from './financial-layout';
export type Cell = string | number | null;
export type TableReport = {
  financialKind?: "entries" | "coupons" | "combined";
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
  const rows = r.rows
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
body{font:11px Arial,sans-serif;margin:24px;color:#111;background:white}h1{font-size:18px;text-align:center;text-transform:uppercase;border:2px solid #333;padding:10px;margin:0 0 8px}.metadata{border:1px solid #555;padding:6px 8px;margin-bottom:12px}.metadata p{margin:4px 0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:5px 4px;overflow-wrap:anywhere}th{text-align:center;background:#e1e1e1;font-size:10px}td.number{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.group td{background:#eee;font-weight:bold;border-top:2px solid #555}.payable{background:#fff3b0;font-weight:bold}thead{display:table-header-group}tr{break-inside:avoid}.totals{margin:14px 0 0 auto;width:55%;break-inside:avoid}.totals th{text-align:left}.totals td{text-align:right;white-space:nowrap}.totals tr:last-child{background:#ebebeb;font-weight:bold;border-top:2px solid #333}footer{font-size:10px;margin-top:12px;color:#444}@page{size:A4 landscape;margin:10mm}@media print{body{margin:0}.screen{display:none}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><h1>Milani — ${escape(r.title)}</h1><div class="metadata">${r.notes.map((n) => `<p>${escape(n)}</p>`).join('')}</div><p class="screen">Use Ctrl+P para imprimir ou salvar em PDF.</p><table><thead><tr>${r.columns.map((c) => `<th>${escape(c.toUpperCase())}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${r.columns.length}">Nenhum registro encontrado.</td></tr>`}</tbody></table><table class="totals"><tbody>${r.totals.map((t) => `<tr><th>${escape(t.label)}</th><td>${escape(Number(t.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))}</td></tr>`).join('')}</tbody></table><footer>Valores em reais (R$). Relatório de conferência.</footer></body></html>`;
}
// Excel 2003 XML: explicit String cells preserve identifiers and prevent formula interpretation.
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
  const row = (cells: Cell[], numeric: number[] = [], heading = false) =>
    `<Row>${cells.map((v, i) => `<Cell${heading ? ' ss:StyleID="heading"' : v != null && numeric.includes(i) ? ' ss:StyleID="money"' : ''}><Data ss:Type="${v != null && numeric.includes(i) ? 'Number' : 'String'}">${escape(v ?? 'Não registrado')}</Data></Cell>`).join('')}</Row>`;
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="heading"><Font ss:Bold="1"/><Interior ss:Color="#E1E1E1" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="money"><NumberFormat ss:Format="#,##0.00"/></Style></Styles><Worksheet ss:Name="Relatorio"><Table>${row([r.title])}${r.notes.map((n) => row([n])).join('')}${row(r.columns, [], true)}${r.rows.map((c) => row(c, r.numeric)).join('')}${r.totals.map((t) => row([t.label, t.value], [1])).join('')}</Table></Worksheet></Workbook>`;
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
