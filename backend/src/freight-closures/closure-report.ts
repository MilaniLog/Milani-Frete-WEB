import { ConflictException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';

type Row = Record<string, any>;
const manifestLabel = (manifest: Row) =>
  [
    manifest.manifestos,
    manifest.manifesto_adicional_1,
    manifest.manifesto_adicional_2,
    manifest.manifesto_adicional_3,
  ]
    .filter(Boolean)
    .join(' / ');
export type ClosureReport = {
  titulo: string;
  origem: string;
  cabecalho: Row;
  manifests: Row[];
  entries: Row[];
  coupons: Row[];
  totals: Row;
  payment: Row | null;
};

export function previewReport(data: Row): ClosureReport {
  return {
    titulo: 'Conferência de frete — prévia',
    origem: 'PREVIA',
    cabecalho: {
      unit: data.unit ?? data.manifests?.[0]?.unit,
      beneficiario: data.beneficiario,
      semana: data.semana,
      placa: data.placa,
      periodo_inicio: data.periodo_inicio,
      periodo_fim: data.periodo_fim,
      numero:
        data.numero ??
        data.closureNumber ??
        data.manifests?.find((row: Row) => row.num_fechamento != null)
          ?.num_fechamento,
      status: 'PRÉVIA — NÃO FINALIZADO',
    },
    manifests: data.manifests,
    entries: data.entries,
    coupons: data.coupons,
    totals: data.totals,
    payment: data.payment ?? null,
  };
}

export function savedReport(detail: Row): ClosureReport {
  const closure = detail.closure;
  const history = closure.historico;
  const original = history?.finalizacao?.dados;
  const cancelled = history?.cancelamento?.dados;
  const source = original ?? cancelled ?? detail;
  if (
    !['manifests', 'entries', 'coupons'].every((key) =>
      Array.isArray(source[key]),
    )
  )
    throw new ConflictException(
      'Dados históricos incompletos para gerar o relatório.',
    );
  return {
    titulo: 'Fechamento de frete',
    origem: original
      ? 'FINALIZACAO'
      : cancelled
        ? 'CANCELAMENTO_LEGADO'
        : 'VINCULOS_ATUAIS',
    cabecalho: {
      beneficiario: source.beneficiario,
      id: closure.id,
      numero: closure.numero,
      unit: closure.unit,
      semana: closure.semana,
      placa: closure.placa,
      periodo_inicio: closure.periodo_inicio,
      periodo_fim: closure.periodo_fim,
      status: closure.status,
      cancelamento: history?.cancelamento
        ? {
            em: history.cancelamento.em,
            motivo: history.cancelamento.motivo,
            usuario: history.cancelamento.usuario,
          }
        : null,
    },
    manifests: source.manifests,
    entries: source.entries,
    coupons: source.coupons,
    totals: original?.totals ?? {
      total_bruto: closure.total_bruto,
      total_ctrb: closure.total_ctrb,
      total_liquido: closure.total_liquido,
    },
    payment: original?.payment ?? null,
  };
}

const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
function money(value: unknown) {
  if (value === null || value === undefined) return 'Não disponível';
  const [whole, fraction] = new Decimal(String(value))
    .toFixed(2, Decimal.ROUND_HALF_EVEN)
    .split('.');
  return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`;
}
function date(value: unknown) {
  if (!value) return 'Não informado';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text)
    ? text.slice(0, 10).split('-').reverse().join('/')
    : text;
}

/** Fixed eight-column worksheet layout, shared by preview and historic reprints. */
export function renderClosureReport(report: ClosureReport): string {
  const h = report.cabecalho;
  const moneyOrDash = (v: unknown) => (v == null ? '—' : money(v));
  const percent = (v: unknown) =>
    v == null
      ? '—'
      : `${new Decimal(String(v)).mul(100).toFixed(2).replace('.', ',')}%`;
  type Cell = { value: unknown; span?: number; right?: boolean };
  const cell = (value: unknown, span = 1, right = false): Cell => ({
    value,
    span,
    right,
  });
  const cols =
    '<colgroup>' +
    [9.1, 13.4, 13.4, 13.4, 13.4, 13.4, 13.4, 10.5]
      .map((w) => `<col style="width:${w}%">`)
      .join('') +
    '</colgroup>';
  const row = (cells: Cell[], heading = false) =>
    `<tr>${cells.map((c) => `<${heading ? 'th' : 'td'} colspan="${c.span ?? 1}" class="${c.right ? 'right' : ''}">${escape(c.value ?? '')}</${heading ? 'th' : 'td'}>`).join('')}</tr>`;
  const table = (rows: string[], cls = '') =>
    `<table class="sheet ${cls}">${cols}<tbody>${rows.join('')}</tbody></table>`;
  const paired = (labels: string[], values: unknown[]) =>
    table([
      row(
        labels.map((v) => cell(v)),
        true,
      ),
      row(values.map((v) => cell(v))),
    ]);
  const fields: [string, string][] = [
    ['DIÁRIA', 'diaria'],
    ['TDE', 'tde'],
    ['ESCADA', 'escada'],
    ['PALETIZAÇÃO', 'paletização'],
    ['ESTADIA', 'estadia'],
    ['DESCARGA', 'descarga'],
    ['OUTROS', 'outros'],
  ];
  const freight: [string, string][] = [
    ['FRT 301', 'cod_777_15'],
    ['FRT COL', 'cod_888_25'],
    ['FRT 100', 'cod_999_100'],
    ['NÃO FRT 301', 'nao_777_calc'],
    ['NÃO FRT COL', 'nao_888_calc'],
    ['NÃO FRT 100', 'nao_999_calc'],
  ];
  const ctrbKeys = [
    'ctrb_total',
    'ctrb_adiantamento',
    'sest_senat',
    'irrf',
    'prev_social',
    'inss',
    'total_retencoes',
    'valor_liquido',
    'vale_pedagio',
  ];
  const sum = (key: string) =>
    report.manifests.length && report.manifests.every((m) => m[key] != null)
      ? report.manifests.reduce(
          (a, m) => a.plus(String(m[key])),
          new Decimal(0),
        )
      : null;
  const aggregate = Object.fromEntries(
    [...fields.map((x) => x[1]), ...freight.map((x) => x[1]), ...ctrbKeys].map(
      (k) => [k, sum(k)],
    ),
  );
  const extras = (m: Row) =>
    paired(
      [...fields.map((x) => x[0]), ''],
      [...fields.map((x) => moneyOrDash(m[x[1]])), ''],
    );
  const ctrb = (m: Row, total = false) =>
    table([
      row(
        (total
          ? [
              'TOTAL CTRB',
              'ADIANTAMENTO',
              'SEST/SENAT',
              'IRRF',
              'PREV SOCIAL',
              'INSS',
              'TTL RETENÇÃO',
              'VALOR LÍQUIDO',
            ]
          : [
              'CTRB',
              'ADIANTAMENTO',
              'SEST/SENAT',
              'IRRF',
              'PREV SOCIAL',
              'INSS',
              'VALOR LÍQUIDO',
              'TOTAL CTRB',
            ]
        ).map((v) => cell(v)),
        true,
      ),
      row(
        (total
          ? ctrbKeys.slice(0, 8).map((k) => moneyOrDash(m[k]))
          : [
              m.ctrb_numero ?? '—',
              ...[
                'ctrb_adiantamento',
                'sest_senat',
                'irrf',
                'prev_social',
                'inss',
                'valor_liquido',
                'ctrb_total',
              ].map((k) => moneyOrDash(m[k])),
            ]
        ).map((v) => cell(v)),
      ),
      row([
        cell('', 6),
        cell('VALE-PEDÁGIO'),
        cell(moneyOrDash(m.vale_pedagio), 1, true),
      ]),
    ]);
  const entries = (list: Row[], advances = false) =>
    table(
      list.map((e) =>
        advances
          ? row([
              cell(e.numero, 1, true),
              cell(money(e.valor)),
              cell('ADIANTAMENTO'),
              cell(e.codigo_despesa),
              cell(e.descricao, 4),
            ])
          : row([
              cell(e.numero, 1, true),
              cell(e.codigo_despesa),
              cell(
                `${e.nome_despesa ?? ''} ${e.tipo_despesa === 'Credito' ? 'C' : 'D'}`,
                2,
              ),
              cell(e.descricao, 3),
              cell(
                `${e.tipo_despesa === 'Credito' ? '+' : '−'}${money(e.valor)}`,
                1,
                true,
              ),
            ]),
      ),
      'entries',
    );
  const ids = new Set(
    report.manifests.map((m) => m.id).filter((id) => id != null),
  );
  const unlinked = report.entries.filter(
    (e) => e.manifesto_id == null || !ids.has(e.manifesto_id),
  );
  const linkedDebits = report.manifests.flatMap((m) =>
    report.entries.filter(
      (e) =>
        m.id != null && e.manifesto_id === m.id && e.tipo_despesa === 'Debito',
    ),
  );
  const bottomEntries = [
    ...linkedDebits,
    ...unlinked.filter((e) => e.tipo_despesa !== 'Adiantamento'),
  ];
  const bottomAdvances = unlinked.filter(
    (e) => e.tipo_despesa === 'Adiantamento',
  );
  const payments = [report.payment?.primeira, report.payment?.segunda].filter(
    (p) =>
      p && (p.empresa || new Decimal(String(p.valor ?? 0)).isZero() === false),
  );
  const printed = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());
  const closureNumber =
    h.numero ??
    report.manifests.find((m) => m.num_fechamento != null)?.num_fechamento ??
    'Prévia';
  const gross = report.totals.total_bruto;
  const net = report.totals.total_liquido;
  const totalValePedagio = sum('vale_pedagio') ?? new Decimal(0);
  const totalCtrb =
    report.totals.total_ctrb != null
      ? new Decimal(String(report.totals.total_ctrb))
      : null;
  const reportGross =
    gross != null ? new Decimal(String(gross)).plus(totalValePedagio) : null;
  const reportSaldo =
    net != null
      ? new Decimal(String(net)).minus(totalCtrb ?? new Decimal(0))
      : null;
  const deductions =
    gross != null && net != null
      ? new Decimal(String(gross)).minus(String(net))
      : null;
  // Display-only indicators use persisted calculated amounts, never current rates.
  const ratio = (a: unknown, b: unknown) =>
    a == null || b == null
      ? null
      : new Decimal(String(b)).isZero()
        ? new Decimal(0)
        : new Decimal(String(a)).div(String(b));
  const sumPresent = (values: unknown[]) =>
    values.every((v) => v != null)
      ? values.reduce<Decimal>((a, v) => a.plus(String(v)), new Decimal(0))
      : null;
  const calculatedFreight = sum('frete_calc'),
    notDelivered = sum('subtotal');
  const subtotal =
    calculatedFreight != null && notDelivered != null
      ? calculatedFreight.minus(notDelivered)
      : null;
  const forUse = sum('sub_total');
  const receivable = sumPresent([forUse, sum('descarga')]);
  const extrasForTest = (m: Row) =>
    sumPresent(
      fields.filter(([, k]) => k !== 'paletização').map(([, k]) => m[k]),
    );
  const indicators = [
    subtotal,
    forUse,
    receivable,
    ratio(reportGross ?? gross, forUse),
    ratio(reportGross ?? gross, receivable),
    ratio(reportGross ?? gross, extrasForTest(aggregate)),
  ];
  const linkedAdvance3333 = report.entries.filter(
    (entry) =>
      entry.tipo_despesa === 'Adiantamento' &&
      String(entry.codigo_despesa ?? '').trim() === '3333' &&
      entry.manifesto_id != null &&
      ids.has(entry.manifesto_id),
  );
  const totalAdiantamento3333 = linkedAdvance3333.reduce(
    (total, entry) => total.plus(String(entry.valor ?? 0)),
    new Decimal(0),
  );
  const ctrbSubtotal = aggregate.valor_liquido;
  const ctrbFinal =
    ctrbSubtotal != null ? ctrbSubtotal.minus(totalAdiantamento3333) : null;
  const firstPayer = report.payment?.primeira?.empresa ?? 'Não cadastrada';
  const owner = `${h.beneficiario?.nome ?? 'Não registrado'}${report.payment?.primeira?.empresa ? ` - ${report.payment.primeira.empresa}` : ''}`;
  const warnings = `${report.origem === 'PREVIA' ? '<p>PRÉVIA — NÃO FINALIZADO. Conferência provisória.</p>' : report.origem !== 'FINALIZACAO' ? '<p>Fechamento legado: sem cópia original da finalização; dados dos vínculos atuais ou do cancelamento.</p>' : ''}${h.status && h.status !== 'FINALIZADO' && report.origem !== 'PREVIA' ? `<p>${escape(h.status)}</p>` : ''}${h.cancelamento ? `<p>Cancelado em ${escape(date(h.cancelamento.em))}. Usuário: ${escape(h.cancelamento.usuario?.cod)}. Motivo: ${escape(h.cancelamento.motivo)}</p>` : ''}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escape(report.titulo)}</title><style>
@page{size:A4 portrait;margin:2mm 1mm 12mm;@bottom-center{content:"Página " counter(page) " de " counter(pages);font:9pt Arial}}
*{box-sizing:border-box}body{font:8.5pt Arial,sans-serif;color:#000;background:white;max-width:208mm;margin:0 auto;line-height:1.15}h1{font-size:9pt;font-weight:normal;text-align:center;margin:0 0 17pt}.sheet{width:100%;table-layout:fixed;border-collapse:collapse;margin:0}.sheet th,.sheet td{font-weight:normal;text-align:left;vertical-align:top;padding:1pt 1pt;overflow-wrap:anywhere;min-height:13pt}.sheet .right{text-align:right;white-space:nowrap}.metadata{margin-bottom:15pt}.metadata td{font-size:7.2pt;padding:0;white-space:nowrap;overflow-wrap:normal}.owner{margin-bottom:1pt}.manifest{border-bottom:1px dashed #333;padding-bottom:10pt;margin-bottom:7pt}.manifest-head{break-inside:avoid}.manifest .sheet{break-inside:avoid}.sheet tr{break-inside:avoid}.manifest-heading th{white-space:nowrap}.entries td{font-size:8pt}.summary{break-inside:avoid}.summary .company td{font-size:10pt}.category-totals{margin:12pt 0;font-size:7.5pt}.category-totals td{white-space:nowrap}.summary th{font-size:7pt;white-space:nowrap}.indicators{margin:10pt 0 12pt}.notes{border-top:1px dashed #333;padding-top:5pt;margin-top:14pt;font-size:7pt}.warnings p{font-size:8pt;margin:3pt 0}.screen{font-size:10pt;background:#eee;padding:8px}h2{font-size:8.5pt;font-weight:normal;margin:5pt 0}.print-info{font-size:7pt}@media print{body{max-width:none;margin:0}.screen{display:none}}
</style></head><body><h1>CONFERÊNCIA DE FRETES E LANÇAMENTOS</h1>
${table([row([cell('SEM:'), cell(h.semana), cell(`PERÍODO:${date(h.periodo_inicio)} - ${date(h.periodo_fim)}`, 2), cell('IMPRESSO EM:'), cell(printed), cell(`UNIDADE:${h.unit ?? '—'}`), cell(`FECH:${closureNumber}`)])], 'metadata')}
${table([row([cell('PLACA:'), cell(h.placa), cell('', 2), cell('PROPRIETÁRIO'), cell(owner, 3)])], 'owner')}
<div class="warnings">${warnings}</div><p class="screen">Ctrl+P para imprimir ou salvar em PDF.</p>
${
  report.manifests
    .map((m, index) => {
      const linked = report.entries.filter(
        (e) => m.id != null && e.manifesto_id === m.id,
      );
      return `<div class="manifest"><div class="manifest-head">${table(
        [
          ...(index === 0
            ? [
                row(
                  [
                    'DATA',
                    'MANIF',
                    'MOTORISTA',
                    'HORA',
                    'QUANT NF',
                    'OBSERVAÇÃO',
                    'DEST',
                    '',
                  ].map((v) => cell(v)),
                  true,
                ),
              ]
            : []),
          row([
            cell(date(m.semana)),
            cell(manifestLabel(m)),
            cell(m.motorista),
            cell(m.hora?.replace(/^(\d{2})(\d{2})$/, '$1:$2').slice(0, 5)),
            cell(m.qtd_nf),
            cell(m.observacao),
            cell('', 2),
          ]),
          row([
            cell(''),
            cell('FRETE'),
            cell(''),
            cell(m.tipo_veiculo),
            cell(`CIOT: ${m.ciot ?? '—'}`, 2),
            cell(m.destino),
            cell(`+${money(m.frete_veiculo)}`, 1, true),
          ]),
        ],
        'manifest-heading',
      )}</div>${entries(linked.filter((e) => e.tipo_despesa === 'Credito'))}${extras(m)}${paired([...freight.map((x) => x[0]), 'PERCENT', '% TEST'], [...freight.map((x) => moneyOrDash(m[x[1]])), percent(m.percentual_antigo), percent(ratio(m.frt_tl_vlc, extrasForTest(m)))])}${ctrb(m)}${entries(
        linked.filter((e) => e.tipo_despesa === 'Adiantamento'),
        true,
      )}</div>`;
    })
    .join('') || '<p>Nenhum manifesto.</p>'
}
${
  bottomEntries.length || bottomAdvances.length
    ? `<h2>DEBITOS E LANCAMENTOS AVULSOS / SEM MANIFESTO</h2>${entries(bottomEntries)}${entries(
        bottomAdvances,
        true,
      )}`
    : ''
}
${report.coupons.length ? `<h2>CUPONS</h2>${table(report.coupons.map((c) => row([cell(c.id), cell(date(c.data_cobranca)), cell(`Nota (ID): ${c.nota_id}`), cell(c.descricao, 4), cell(`−${money(c.valor)}`, 1, true)])))}` : ''}
<div class="summary">${table([row([cell('T Bruto:'), cell(moneyOrDash(reportGross)), cell('T CTRB:'), cell(moneyOrDash(totalCtrb)), cell('T Vales:'), cell(moneyOrDash(deductions)), cell('Saldo:'), cell(moneyOrDash(reportSaldo), 1, true)])])}
${table(
  [
    row([
      cell('', 6),
      cell(firstPayer),
      cell(moneyOrDash(reportSaldo), 1, true),
    ]),
    row([
      cell('', 6),
      cell('SUBTOTAL CTRB'),
      cell(moneyOrDash(ctrbSubtotal), 1, true),
    ]),
    ...linkedAdvance3333.map((entry) =>
      row([
        cell('', 6),
        cell(entry.numero ?? '3333'),
        cell(`−${money(entry.valor)}`, 1, true),
      ]),
    ),
    row([
      cell('', 6),
      cell('TOTAL CTRB'),
      cell(moneyOrDash(ctrbFinal), 1, true),
    ]),
  ],
  'company',
)}
${extras(aggregate)}
${table([row([cell('Total 301'), cell(moneyOrDash(aggregate.cod_777_15), 1, true), cell('Total COL'), cell(moneyOrDash(aggregate.cod_888_25), 1, true), cell('Total 100'), cell(moneyOrDash(aggregate.cod_999_100), 1, true), cell('', 2)]), row([cell('Total Não 301'), cell(moneyOrDash(aggregate.nao_777_calc), 1, true), cell('Total Não COL'), cell(moneyOrDash(aggregate.nao_888_calc), 1, true), cell('Total Não 100'), cell(moneyOrDash(aggregate.nao_999_calc), 1, true), cell('', 2)])], 'category-totals')}
${ctrb(aggregate, true)}
${table(
  [
    'SUBTOTAL 1',
    'PARA USO',
    'TOTAL A RECEBER',
    'Percentual novo',
    'Percentual',
    '% TEST',
  ].map((label, i) =>
    row([
      cell('', 6),
      cell(label),
      cell(
        i < 3 ? moneyOrDash(indicators[i]) : percent(indicators[i]),
        1,
        true,
      ),
    ]),
  ),
  'indicators',
)}</div>
<div class="notes">Fechamento: ${escape(closureNumber)}. ${escape(report.payment?.criterio ? `Critério: ${report.payment.criterio}.` : 'Distribuição do pagamento não registrada.')} Documento de conferência; não comprova transferência. Saldo do relatório conforme VBA: líquido do fechamento menos CTRB bruto; TOTAL CTRB = subtotal do valor líquido do CTRB menos adiantamentos 3333. “—”: informação não registrada no histórico.</div></body></html>`;
}
