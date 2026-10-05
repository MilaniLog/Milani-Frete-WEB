const fs = require('fs');
const path = require('path');
const { reportHtml } = require('../src/reports/report-render');
const {
  renderClosureReport,
} = require('../src/freight-closures/closure-report');
const dir = path.resolve('../artifacts/exemplos-relatorios');
fs.mkdirSync(dir, { recursive: true });
const write = (n, h) => fs.writeFileSync(path.join(dir, n + '.html'), h);
const notes = [
  'EXEMPLO - DADOS FICTICIOS',
  'Unidade 100 | Semana 3926 | 20/09/2026 a 26/09/2026',
];
write(
  'pagamentos',
  reportHtml({
    title: 'Planilha de pagamentos',
    notes,
    columns: [
      'EMPR',
      'CPF/CNPJ PROP',
      'NOME PROP',
      'SEM',
      'FECH',
      'PLACA',
      'TTL FRETE',
      'CTRB BRT',
      'LIQ S/ CTRB',
      'VALES',
      'LIQ PAGAR',
      'UN',
      'CTRB LIQ',
    ],
    rows: [
      [
        'EX',
        '00000000000',
        'PROPRIETARIO EXEMPLO',
        3926,
        1,
        'ABC1D23',
        2500,
        500,
        2000,
        150,
        1850,
        100,
        500,
      ],
    ],
    numeric: [6, 7, 8, 9, 10, 12],
    totals: [
      { label: 'Total TTL FRETE', value: '2500' },
      { label: 'Total VALES', value: '150' },
      { label: 'Total LIQ PAGAR', value: '1850' },
    ],
  }),
);
write(
  'lancamentos-cupons',
  reportHtml({
    title: 'Lancamentos e cupons',
    notes,
    columns: [
      'Origem',
      'Lanc',
      'Data',
      'Placa',
      'Motorista',
      'Manif/NF',
      'Codigo',
      'Tipo',
      'Descricao',
      'D/C',
      'Valor',
      'Departamento',
      'Situacao',
    ],
    rows: [
      [
        'Lancamento',
        101,
        '23/09/2026',
        'ABC1D23',
        'MOTORISTA EXEMPLO',
        'Avulso',
        1,
        'Despesa',
        'Despesa demonstrativa',
        'D',
        -100,
        'Operacional',
        'Finalizado',
      ],
      [
        'Cupom',
        201,
        '24/09/2026',
        'ABC1D23',
        'MOTORISTA EXEMPLO',
        301,
        2,
        'Cupom',
        'Cupom demonstrativo',
        'D',
        -50,
        'Operacional',
        'Finalizado',
      ],
    ],
    numeric: [10],
    totals: [
      { label: 'Debitos e cupons', value: '150' },
      { label: 'Creditos menos debitos e cupons', value: '-150' },
    ],
  }),
);
// Two fictional manifests exercise the same density as the supplied Excel PDF.
const manifest = (id, value, daily, unloading, ctrb) => ({
  id,
  unit: 100,
  manifestos: `90000000${id}-0`,
  semana: `2026-09-${21 + id}`,
  hora: id === 1 ? '12:29' : '17:51',
  qtd_nf: 2,
  motorista: 'MOTORISTA EXEMPLO',
  tipo_veiculo: 'FIORINO',
  destino: id === 1 ? 'CACHOEIRO' : 'SERRA',
  ciot: `00000000000${id}`,
  observacao: '',
  diaria: daily,
  tde: 0,
  escada: 0,
  paletização: 0,
  estadia: 0,
  descarga: unloading,
  outros: 0,
  cod_777_15: value,
  cod_888_25: 0,
  cod_999_100: 0,
  nao_777_calc: 0,
  nao_888_calc: 0,
  nao_999_calc: 0,
  frete_calc: value,
  subtotal: 0,
  sub_total: value + daily,
  frete_veiculo: id === 1 ? 1800 : 600,
  frt_tl_vlc: id === 1 ? 1800 : 600,
  percentual_antigo: 0.3,
  ctrb_numero: `000000000${id}`,
  ctrb_total: ctrb,
  ctrb_adiantamento: 0,
  sest_senat: 0,
  irrf: 0,
  prev_social: 0,
  inss: 0,
  total_retencoes: 0,
  valor_liquido: ctrb,
  vale_pedagio: 0,
});
const entry = (numero, manifesto_id, tipo_despesa, valor) => ({
  numero,
  manifesto_id,
  codigo_despesa:
    tipo_despesa === 'Credito'
      ? '0050'
      : tipo_despesa === 'Debito'
        ? '0004'
        : '3333',
  nome_despesa:
    tipo_despesa === 'Credito' ? 'DESCARGA/AJD CUSTO' : 'MOEDA - DESCARGA',
  tipo_despesa,
  descricao: '',
  valor,
});
const closureExample = {
  titulo: 'Fechamento - exemplo fictício',
  origem: 'FINALIZACAO',
  cabecalho: {
    numero: 1,
    unit: 100,
    semana: 3926,
    placa: 'ABC1D23',
    beneficiario: { nome: 'PROPRIETÁRIO EXEMPLO' },
    periodo_inicio: '2026-09-20',
    periodo_fim: '2026-09-26',
    status: 'EXEMPLO — DADOS FICTÍCIOS',
  },
  manifests: [manifest(1, 5800, 900, 235, 1080), manifest(2, 2100, 0, 15, 260)],
  entries: [
    entry(101, 1, 'Credito', 125),
    entry(102, 1, 'Credito', 110),
    entry(103, 1, 'Debito', 125),
    entry(104, 1, 'Debito', 110),
    entry(105, 1, 'Adiantamento', 1080),
    entry(106, 2, 'Credito', 15),
    entry(107, 2, 'Debito', 15),
    entry(108, 2, 'Adiantamento', 260),
  ],
  coupons: [],
  totals: {
    fretes: 2400,
    creditos: 250,
    debitos: 250,
    cupons: 0,
    total_bruto: 2650,
    total_ctrb: 1340,
    total_liquido: 2400,
  },
  payment: {
    criterio: 'CTRB',
    ctrbs: ['0000000001', '0000000002'],
    primeira: { empresa: 'EXEMPLO', valor: 2400 },
    segunda: { empresa: null, valor: 0 },
  },
};
const closureHtml = renderClosureReport(closureExample);
write('fechamento', closureHtml);
write('fechamento-ajustado', closureHtml);

const financialExample = {
  title:'Conferência de lançamentos e cupons',
  notes:['EXEMPLO — DADOS FICTÍCIOS', 'PERÍODO: 20/09/2026 a 26/09/2026 · SEMANA: 3926 · UNIDADE: 100'],
  columns:['Origem','Lanç','Data','Placa','Motorista','Manif/NF','Código','Tipo','Descrição','D/C','Valor','Departamento','Situação'],
  rows:[
    ['Lançamento',101,'21/09/2026','ABC1D23','MOTORISTA EXEMPLO','900000001-0','0003','MOEDA - ADIANTAMENTO','','Debito','-200','Operacional','Em aberto'],
    ['Lançamento',102,'22/09/2026','DEF4G56','MOTORISTA EXEMPLO','900000002-0','0003','MOEDA - ADIANTAMENTO','','Debito','-550','Operacional','Em aberto'],
    ['Lançamento',103,'22/09/2026','ABC1D23','MOTORISTA EXEMPLO','900000001-0','0004','MOEDA - DESCARGA / AJD CUSTO','','Debito','-120','Operacional','Em aberto'],
    ['Lançamento',104,'23/09/2026','DEF4G56','MOTORISTA EXEMPLO','900000002-0','0005','MOEDA - ESCADA','','Debito','-60','Operacional','Em aberto'],
  ], numeric:[10], totals:[],
};
write('lancamentos-cupons',reportHtml(financialExample));
write('lancamentos-ajustado',reportHtml(financialExample));
fs.writeFileSync(path.join(dir,'lancamentos-ajustado.xml'),require('../src/reports/report-render').reportSpreadsheet(financialExample));
