import {
  previewReport,
  savedReport,
  renderClosureReport,
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
    expect(html).toContain('>—</td>');
    expect(html).not.toContain('R$ 0,00');
  });
  it('agrupa lançamentos pelo manifesto e mantém avulsos sem duplicar', () => {
    const html = renderClosureReport(
      previewReport({
        manifests: [
          { id: 1, manifestos: 'M1', hora: '1229', frete_veiculo: '100' },
        ],
        entries: [
          {
            numero: 'VINCULADO',
            manifesto_id: 1,
            tipo_despesa: 'Debito',
            valor: '10',
          },
          {
            numero: 'AVULSO',
            manifesto_id: null,
            tipo_despesa: 'Credito',
            valor: '5',
          },
        ],
        coupons: [],
        totals: { total_liquido: '95' },
      }),
    );
    expect(html.match(/VINCULADO/g)).toHaveLength(1);
    expect(html.match(/>AVULSO</g)).toHaveLength(1);
    expect(html).toContain('12:29');
    expect(html).toContain('R$ 95,00');
    expect(html.indexOf('DEBITOS E LANCAMENTOS AVULSOS')).toBeLessThan(
      html.indexOf('VINCULADO'),
    );
    expect(html.indexOf('DEBITOS E LANCAMENTOS AVULSOS')).toBeLessThan(
      html.indexOf('AVULSO'),
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
});
