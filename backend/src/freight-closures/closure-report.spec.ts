import {
  previewReport,
  savedReport,
  renderClosureReport,
  renderDriverClosureReport,
} from './closure-report';

describe('Relatórios de fechamento', () => {
  it('usa fretes calculados do histórico e não desconta CTRB novamente', () => {
    const report = previewReport({
      manifests: [
        {
          frete_veiculo: 100,
          cod_777_00: 9999,
          cod_777_15: 800,
          cod_888_25: 0,
          cod_999_100: 0,
          nao_777_calc: 0,
          nao_888_calc: 0,
          nao_999_calc: 0,
          frete_calc: 800,
          subtotal: 0,
          sub_total: 850,
          diaria: 50,
          tde: 0,
          escada: 0,
          paletização: 0,
          estadia: 0,
          descarga: 10,
          outros: 0,
        },
      ],
      entries: [],
      coupons: [],
      totals: { total_bruto: 100, total_ctrb: 40, total_liquido: 90 },
    });
    const before = JSON.stringify(report);
    const html = renderClosureReport(report);
    expect(html).toContain('R$ 800,00');
    expect(html).not.toContain('R$ 9.999,00');
    expect(html).toContain('R$ 850,00');
    expect(html).toContain('R$ 860,00');
    expect(html).toMatch(/Saldo:<\/td><td[^>]*>R\$ 50,00/);
    expect(JSON.stringify(report)).toBe(before);
    expect(html).toContain('colspan="1" class="">SUBTOTAL CTRB</td>');
    expect(html).toContain('.summary .company col:nth-child(7){width:17.4%!important}');
  });
  it('mostra o número do fechamento no canto direito da primeira linha', () => {
    const html = renderClosureReport(
      previewReport({
        semana: '3826',
        placa: 'AAQ2714',
        periodo_inicio: '2026-09-13',
        periodo_fim: '2026-09-19',
        closureNumber: 38260001,
        manifests: [{ num_fechamento: 38260001, frete_veiculo: 10 }],
        entries: [],
        coupons: [],
        totals: { total_liquido: 10 },
      }),
    );
    expect(html).toContain('FECH:38260001');
    expect(html.indexOf('FECH:38260001')).toBeLessThan(
      html.indexOf('PLACA:'),
    );
  });

  it('mostra os percentuais inicial e final corretos na conferência e no fechamento', () => {
    const report = previewReport({
      manifests: [{
        manifestos: '100000001-1',
        frt_tl_vlc: 100,
        frete_calc: 800,
        sub_total: 850,
        carreg_perc: 0.125,
        perc_final: 0.11764706,
        percentual_antigo: 8.9853,
      }],
      entries: [],
      coupons: [],
      totals: { total_bruto: 100, total_liquido: 100 },
    });
    const preview = renderClosureReport(report);
    expect(preview).toContain('PERC. INICIAL');
    expect(preview).toContain('PERC. FINAL');
    expect(preview).toContain('12,50%');
    expect(preview).toContain('11,76%');
    expect(preview).not.toContain('898,53%');
    expect(preview).not.toContain('% TEST');
    expect(preview).not.toContain('Percentual antigo');
    expect(preview).toContain('<div class="report-row-gap" aria-hidden="true"></div>');
    expect(preview.match(/class="report-row-gap"/g)).toHaveLength(2);

    const final = renderClosureReport({
      ...report,
      origem: 'FINALIZACAO',
    });
    expect(final).toContain('12,50%');
    expect(final).toContain('11,76%');
    expect(final).not.toContain('898,53%');
  });

  it('preserva dados ausentes em vez de inventar zeros no histórico', () => {
    const html = renderClosureReport(
      previewReport({
        manifests: [{ frete_veiculo: 10 }],
        entries: [],
        coupons: [],
        totals: { total_liquido: 10 },
      }),
    );
    expect(html).toContain('SUBTOTAL 1');
    expect(html).not.toContain('>—</td>');
    expect(html).not.toMatch(/Não (registrad|informad|disponível)/);
    expect(html).not.toContain('R$ 0,00');
  });
  it('ordena manifestos, vales e cupons por data dentro da placa', () => {
    const html = renderClosureReport(
      previewReport({
        manifests: [
          { id: 2, manifestos: 'MANIFESTO-TARDE', semana: '2026-10-10', frete_veiculo: '1' },
          { id: 1, manifestos: 'MANIFESTO-CEDO', semana: '2026-10-08', frete_veiculo: '1' },
        ],
        entries: [
          { id: 10, manifesto_id: null, codigo_despesa: '3333', tipo_despesa: 'Debito', data_lancamento: '2026-10-01', descricao: 'CTRB-SEMPRE-POR-ULTIMO', valor: '1' },
          { id: 12, manifesto_id: null, tipo_despesa: 'Debito', data_lancamento: '2026-10-09', descricao: 'VALE-TARDE', valor: '1', responsavel_cod: 77 },
          { id: 11, manifesto_id: null, tipo_despesa: 'Debito', data_lancamento: '2026-10-07', descricao: 'VALE-CEDO', valor: '1', responsavel_cod: 76 },
        ],
        coupons: [
          { id: 22, data_cobranca: '2026-10-11', descricao: 'CUPOM-TARDE', valor: '1' },
          { id: 21, controle_id: 1021, data_cobranca: '2026-10-06', descricao: 'CUPOM-CEDO', valor: '1', responsavel_cod: 88, nota: { codigo_tipo: 'DIESEL', nome_tipo: 'Combustível' } },
        ],
        totals: { total_liquido: '0' },
      }),
    );
    expect(html.indexOf('MANIFESTO-CEDO')).toBeLessThan(html.indexOf('MANIFESTO-TARDE'));
    expect(html.indexOf('VALE-CEDO')).toBeLessThan(html.indexOf('VALE-TARDE'));
    expect(html.indexOf('VALE-TARDE')).toBeLessThan(
      html.indexOf('CTRB-SEMPRE-POR-ULTIMO'),
    );
    expect(html).toContain('07/10/2026');
    expect(html).toContain('09/10/2026');
    expect(html.indexOf('CUPOM-CEDO')).toBeLessThan(html.indexOf('CUPOM-TARDE'));
    expect(html.indexOf('CUPOM-CEDO')).toBeLessThan(html.indexOf('VALE-CEDO'));
    expect(html).toContain('<h2>VALES</h2>');
    expect(html).toContain('<div class="vale-section"><h2>VALES</h2>');
    expect(html).not.toContain('<h2>CUPONS</h2>');
    expect(html).toContain('1021');
    expect(html).not.toContain('DIESEL');
    expect(html).toContain('ABASTECIMENTO · CUPOM');
    expect(html).toContain('USUÁRIO 88');
    expect(html).toContain('USUÁRIO 77');
  });
  it('mantém créditos no manifesto e agrupa todos os vales abaixo sem duplicar', () => {
    const html = renderClosureReport(
      previewReport({
        manifests: [
          { id: 1, manifestos: 'M1', hora: '1229', frete_veiculo: '100' },
        ],
        entries: [
          {
            id: 2,
            numero: 'VINCULADO',
            manifesto_id: 1,
            tipo_despesa: 'Debito',
            valor: '10',
            descricao: 'VINCULADO',
          },
          {
            id: 3,
            numero: 'AVULSO',
            manifesto_id: null,
            tipo_despesa: 'Credito',
            valor: '5',
            descricao: 'AVULSO',
          },
          {
            id: 4,
            numero: 'OUTRO-MANIFESTO',
            manifesto_id: 999,
            codigo_despesa: '3333',
            tipo_despesa: 'Adiantamento',
            valor: '50',
            descricao: 'NÃO DEVE APARECER',
          },
          {
            id: 7,
            numero: 'ADIANTAMENTO-ATUAL',
            manifesto_id: 1,
            codigo_despesa: '3333',
            tipo_despesa: 'Adiantamento',
            valor: '20',
            descricao: 'ADIANTAMENTO NO MANIFESTO',
          },
          {
            id: 6,
            numero: 'DEBITO-ANTIGO',
            manifesto_id: 998,
            codigo_despesa: '0005',
            tipo_despesa: 'Debito',
            valor: '9',
            descricao: 'DEBITO ANTIGO EM ABERTO',
          },
          {
            id: 5,
            numero: 'VINCULADO-POR-NUMERO',
            manifesto_id: null,
            manifesto_numero: 'M1',
            tipo_despesa: 'Credito',
            valor: '7',
            descricao: 'VINCULADO POR NUMERO',
          },
        ],
        coupons: [],
        totals: { total_liquido: '95' },
      }),
    );
    expect(html.match(/>VINCULADO</g)).toHaveLength(1);
    expect(html.match(/>AVULSO</g)).toHaveLength(1);
    expect(html).toContain('12:29');
    expect(html).toContain('R$ 95,00');
    expect(html.indexOf('>VINCULADO</td>')).toBeGreaterThan(
      html.indexOf('<h2>VALES</h2>'),
    );
    expect(html.indexOf('VINCULADO POR NUMERO')).toBeLessThan(
      html.indexOf('<h2>VALES</h2>'),
    );
    expect(html.indexOf('AVULSO')).toBeLessThan(html.indexOf('<h2>VALES</h2>'));
    expect(html).toContain('DEBITO ANTIGO EM ABERTO');
    expect(html.indexOf('ADIANTAMENTO NO MANIFESTO')).toBeLessThan(
      html.indexOf('<h2>VALES</h2>'),
    );
    expect(html).toMatch(/>CTRB<\/td>[\s\S]*?ADIANTAMENTO NO MANIFESTO/);
    expect(html).toMatch(
      /<td colspan="1" class="">7<\/td>[\s\S]*?ADIANTAMENTO NO MANIFESTO/,
    );
    expect(html).not.toContain('NÃO DEVE APARECER');
    expect(html).toMatch(
      /<h2>VALES<\/h2>[\s\S]*?<td colspan="1" class="">2<\/td>/,
    );
  });
  const rows = {
    manifests: [{ manifestos: 'ORIGINAL', frete_veiculo: '1234.56' }],
    entries: [],
    coupons: [],
  };
  const data = {
    ...rows,
    semana: '0001',
    placa: 'ABC1234',
    totals: { total_liquido: '1234.56' },
  };
  it('prioriza histórico de finalização sobre registros atuais', () => {
    const report = savedReport({
      ...rows,
      manifests: [],
      closure: {
        status: 'CANCELADO',
        historico: { finalizacao: { dados: data } },
      },
    });
    expect(report.origem).toBe('FINALIZACAO');
    expect(report.manifests[0].manifestos).toBe('ORIGINAL');
    expect(report.cabecalho.status).toBe('CANCELADO');
  });
  it('recupera o identificador global em históricos antigos', () => {
    const report = savedReport({
      manifests: [],
      entries: [{ id: 1434, controle_id: 1521 }],
      coupons: [],
      closure: {
        historico: {
          finalizacao: {
            dados: {
              ...data,
              entries: [
                {
                  id: 1434,
                  codigo_despesa: '0002',
                  tipo_despesa: 'Debito',
                  valor: '120',
                },
              ],
            },
          },
        },
      },
    });
    expect(report.entries[0].controle_id).toBe(1521);
    expect(renderClosureReport(report)).toContain('1521');
  });
  it('usa cópia do cancelamento legado após exclusão dos registros reabertos', () => {
    const report = savedReport({
      manifests: [],
      entries: [],
      coupons: [],
      closure: {
        total_liquido: '10',
        historico: { cancelamento: { dados: rows, motivo: 'Correção' } },
      },
    });
    expect(report.origem).toBe('CANCELAMENTO_LEGADO');
    expect(report.manifests).toHaveLength(1);
    expect(report.payment).toBeNull();
  });
  it('identifica vínculos atuais de fechamento sem histórico', () => {
    expect(savedReport({ ...rows, closure: { historico: null } }).origem).toBe(
      'VINCULOS_ATUAIS',
    );
  });
  it('não substitui silenciosamente cópia histórica incompleta', () => {
    expect(() =>
      savedReport({
        ...rows,
        closure: { historico: { finalizacao: { dados: {} } } },
      }),
    ).toThrow();
  });
  it('escapa conteúdo cadastrado e formata moeda brasileira', () => {
    const report = previewReport({
      ...data,
      placa: '<script>alert(1)</script>',
    });
    const html = renderClosureReport(report);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('R$ 1.234,56');
    expect(html).toContain('PRÉVIA — NÃO FINALIZADO');
    expect(html).toContain('@media print');
  });
  it('não recalcula rateio histórico', () => {
    const payment = {
      criterio: 'RATEIO',
      ctrbs: [],
      primeira: { empresa: 'ANTIGA', valor: '800' },
      segunda: { empresa: 'B', valor: '200' },
    };
    const report = savedReport({
      ...rows,
      closure: { historico: { finalizacao: { dados: { ...data, payment } } } },
    });
    expect(renderClosureReport(report)).toContain('ANTIGA');
    expect(report.payment).toEqual(payment);
  });

  it('identifica o PDF final como fechamento de frete sem aviso de prévia', () => {
    const report = savedReport({
      ...rows,
      closure: {
        numero: 38260001,
        status: 'FINALIZADO',
        historico: { finalizacao: { dados: data } },
      },
    });
    const html = renderClosureReport(report);
    expect(html).toContain('FECHAMENTO DE FRETE');
    expect(html).toContain('Documento de fechamento de frete.');
    expect(html).not.toContain('PRÉVIA — NÃO FINALIZADO');
  });

  it('gera o relatório individual do motorista com manifestos e vales', () => {
    const html = renderDriverClosureReport(
      previewReport({
        semana: '3826',
        placa: 'ABC1234',
        manifests: [
          {
            manifestos: '12345',
            motorista: 'Motorista Teste',
            destino: 'SP',
            frete_veiculo: 100,
            vlr_ctrb: 20,
            vlr_liquido: 80,
          },
        ],
        entries: [
          {
            id: 77,
            numero: '77',
            codigo_despesa: '3333',
            nome_despesa: 'Adiantamento',
            tipo_despesa: 'Adiantamento',
            valor: 10,
          },
        ],
        coupons: [],
        totals: { total_bruto: 100, total_ctrb: 20, total_liquido: 80 },
      }),
    );
    expect(html).toContain('RELATÓRIO POR MOTORISTA');
    expect(html).toContain('Motorista Teste');
    expect(html).toContain('12345');
    expect(html).toContain('CTRB');
    expect(html).toContain('Líquido a pagar');
  });
});
