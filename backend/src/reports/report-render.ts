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
  plateDetails?: Record<string, { driver?: string | null; vehicleType?: string | null }>;
  printLayout?: 'compact-pairs';
  title: string;
  notes: string[];
  columns: string[];
  rows: Cell[][];
  totals: { label: string; value: string }[];
  totalSections?: {
    title: string;
    totals: { label: string; value: string }[];
  }[];
  numeric: number[];
  subtotalRows?: number[];
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
      ? ''
      : r.numeric.includes(i)
        ? Number(v).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : v;
  const payments = ['EMPR', 'EMPRESA'].includes(r.columns[0]);
  let company: Cell | undefined;
  const rows = printRows
    .map((row, rowIndex) => {
      const subtotal = r.subtotalRows?.includes(rowIndex) ?? false;
      const group =
        payments && !subtotal && row[0] !== company
          ? `<tr class="group"><td colspan="${r.columns.length}">EMPRESA: ${escape(row[0] ?? '')}</td></tr>`
          : '';
      company = row[0];
      return (
        group +
        `<tr class="${subtotal ? 'subtotal' : ''}">${row.map((v, i) => `<td class="${r.numeric.includes(i) ? 'number' : ''} ${payments && i === 11 ? 'payable' : ''}">${escape(format(v, i))}</td>`).join('')}</tr>`
      );
    })
    .join('');
  const totalSections = r.totalSections ?? [{ title: '', totals: r.totals }];
  const totalsHtml = totalSections
    .map(
      (section) =>
        `<section class="total-block"><table class="totals"><tbody>${section.totals.map((t) => `<tr><th>${escape(t.label)}</th><td>${escape(Number(t.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))}</td></tr>`).join('')}</tbody></table></section>`,
    )
    .join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escape(r.title)}</title><style>
body{font:${compactPairs ? '10px' : '11px'} Arial,sans-serif;margin:24px;color:#111;background:white}h1{font-size:${compactPairs ? '15px' : '18px'};text-align:center;text-transform:uppercase;border:2px solid #333;padding:${compactPairs ? '7px' : '10px'};margin:0 0 8px}.metadata{border:1px solid #555;padding:6px 8px;margin-bottom:12px}.metadata p{margin:4px 0}table{border-collapse:collapse;width:100%;table-layout:${compactPairs ? 'fixed' : 'auto'}}th,td{border:1px solid #888;padding:${compactPairs ? '3px 4px' : '5px 4px'};overflow-wrap:anywhere}th{text-align:center;background:#e1e1e1;font-size:10px}td.number{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.group td{background:#eee;font-weight:bold;border-top:2px solid #555}.subtotal td{background:#f2f2f2;font-weight:bold;border-top:2px solid #777}.payable{background:#fff3b0;font-weight:bold}thead{display:table-header-group}tr{break-inside:avoid}.total-sections{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin-top:8px;break-inside:avoid}.total-block{break-inside:avoid}.totals{margin:0;width:100%;font-size:8px}.totals th{text-align:left;padding:3px}.totals td{text-align:right;white-space:nowrap;padding:3px}.totals tr:last-child{background:#ebebeb;font-weight:bold;border-top:2px solid #333}footer{font-size:10px;margin-top:8px;color:#444}@page{size:A4 ${compactPairs ? 'portrait' : 'landscape'};margin:10mm 10mm 14mm}@media print{body{margin:0}.screen{display:none}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><h1>Milani — ${escape(r.title)}</h1><div class="metadata">${r.notes.map((n) => `<p>${escape(n)}</p>`).join('')}</div><p class="screen">Use Ctrl+P para imprimir ou salvar em PDF.</p><table><thead><tr>${printColumns.map((c) => `<th>${escape(c.toUpperCase())}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${printColumns.length}">Nenhum registro encontrado.</td></tr>`}</tbody></table><div class="total-sections">${totalsHtml}</div>${compactPairs ? '' : '<footer>Valores em reais (R$). Relatório de conferência.</footer>'}</body></html>`;
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
        ['SUBTOTAL', '', '', '', '', '', '', '', '', g.total.toFixed(2), ''],
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
            'CTRB (informativo)',
            'Créditos menos débitos e cupons',
          ].includes(t.label),
        ),
      ],
    });
  }
  const payments = ['EMPR', 'EMPRESA'].includes(r.columns[0]);
  let company: Cell | undefined;
  const dataRows: { row: Cell[]; sourceIndex?: number; group?: boolean }[] = [];
  r.rows.forEach((row, sourceIndex) => {
    const subtotal = r.subtotalRows?.includes(sourceIndex) ?? false;
    if (payments && !subtotal && row[0] !== company) {
      company = row[0];
      dataRows.push({ row: [`EMPRESA: ${row[0] ?? 'SEM EMPRESA'}`], group: true });
    }
    dataRows.push({ row, sourceIndex });
  });
  const totalSections = r.totalSections ?? [{ title: '', totals: r.totals }];
  const footerRows: {
    row: Cell[];
    heading?: boolean;
    numericColumns?: number[];
  }[] = [];
  if (r.totalSections?.length) {
    const length = Math.max(...totalSections.map((section) => section.totals.length));
    for (let index = 0; index < length; index++) {
      const row: Cell[] = [];
      const numericColumns: number[] = [];
      totalSections.forEach((section, sectionIndex) => {
        const total = section.totals[index];
        const offset = sectionIndex * 3;
        row[offset] = total?.label ?? null;
        row[offset + 1] = total?.value ?? null;
        row[offset + 2] = null;
        if (total) numericColumns.push(offset + 1);
      });
      footerRows.push({ row, numericColumns });
    }
  } else {
    r.totals.forEach((total) =>
      footerRows.push({ row: [total.label, total.value], numericColumns: [1] }),
    );
  }
  const rows: Cell[][] = [
    [r.title],
    ...r.notes.map((note) => [note]),
    [],
    r.columns,
    ...dataRows.map((item) => item.row),
    [],
    ...footerRows.map((item) => item.row),
  ];
  const headingRow = 2 + r.notes.length;
  const dataStart = headingRow + 1;
  const numeric = new Set<string>();
  dataRows.forEach((item, rowIndex) => {
    if (item.sourceIndex != null)
      r.numeric.forEach((column) => numeric.add(`${dataStart + rowIndex}:${column}`));
  });
  const totalsStart = dataStart + dataRows.length + 1;
  footerRows.forEach((item, index) => {
    item.numericColumns?.forEach((column) =>
      numeric.add(`${totalsStart + index}:${column}`),
    );
  });
  const headingRows = new Set([0, headingRow]);
  dataRows.forEach((item, index) => {
    if (item.group) headingRows.add(dataStart + index);
  });
  footerRows.forEach((item, index) => {
    if (item.heading) headingRows.add(totalsStart + index);
  });
  return xlsxWorkbook(rows, numeric, headingRows);
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
