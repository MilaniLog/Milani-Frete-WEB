import { ReportsService } from './reports.service';
import { reportHtml, reportSpreadsheet } from './report-render';
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
describe('Relatórios VBA', () => {
  const user = { sub: 1, cod: 7, unit: 100, isAdmin: false };
  let db: any, service: ReportsService;
  const start = new Date('2026-09-20'),
    end = new Date('2026-09-26');
  const original = {
    manifests: [
      {
        id: 1,
        manifestos: 'M1',
        frete_veiculo: '1000',
        ctrb_total: '200',
        valor_liquido: '150',
      },
      { frete_veiculo: '0', ctrb_total: '999', valor_liquido: '999' },
    ],
    entries: [],
    coupons: [],
    totals: { total_bruto: '1000', total_liquido: '900', total_ctrb: '1199' },
    payment: {
      primeira: { empresa: 'MMA', valor: '900' },
      segunda: { empresa: null, valor: '0' },
      ctrbs: [],
      criterio: 'CTRB',
    },
    beneficiario: { documento: '00123456789', nome: 'Proprietário original' },
  };
  beforeEach(() => {
    db = {
      frete_semanas: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            codigo: '3926',
            data_inicio: start,
            data_fim: end,
          }),
      },
      frete_lancamentos: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 1,
              numero: 5,
              unit: 100,
              manifesto_id: 1,
              placa: 'ABC1234',
              motorista: 'João',
              codigo_despesa: '0002',
              nome_despesa: 'Pedágio',
              tipo_despesa: 'Credito',
              valor: '0.10',
              data_lancamento: start,
              created_at: start,
              pago: false,
              fechamento_id: null,
              descricao: '<script>x</script>',
              departamento: 'A',
            },
          ]),
      },
      frete_cupons: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 2,
              placa: 'ABC1234',
              motorista: 'João',
              nota: {
                numero: '0001',
                codigo_tipo: '0009',
                nome_tipo: 'Avaria',
              },
              valor: '0.20',
              data_cobranca: start,
              created_at: start,
              pago: false,
              fechamento_id: null,
              departamento: 'A',
            },
          ]),
      },
      frete_carregamento_manifestos: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, manifestos: 'M1' }]),
      },
      frete_fechamentos: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 3,
              numero: 40,
              unit: 100,
              semana: '3926',
              placa: 'ABC1234',
              status: 'FECHADO',
              periodo_inicio: start,
              periodo_fim: end,
              total_bruto: '1000',
              total_liquido: '900',
              total_ctrb: '1199',
              historico: { finalizacao: { dados: original } },
            },
          ]),
      },
      vehicle: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              plate: 'ABC1234',
              owner: '99999999999',
              owner_name: 'Alterado',
              empresa_sigla: 'ATT',
            },
          ]),
      },
    };
    db.$transaction = jest.fn((work) => work(db));
    service = new ReportsService(db);
  });
  it('soma valores decimais, diferencia cupons e lançamentos e escapa texto', async () => {
    const result = await service.financial({ semana: '3926' }, user);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0][5]).toBe('M1');
    expect(result.rows[1][5]).toBe('0001');
    expect(result.totals.at(-1)?.value).toBe('-0.10');
    expect(reportHtml(result)).not.toContain('<script>');
    expect(reportHtml(result)).toContain('&lt;script&gt;');
  });
  it('aplica placa, departamento, usuário, status e intervalo de inclusão à unidade', async () => {
    await service.financial(
      {
        inicio: '2026-09-20',
        fim: '2026-09-26',
        placa: 'ABC1234',
        departamento: 'A',
        usuario: '7',
        data_por: 'inclusao',
        situacao: 'abertos',
      },
      user,
    );
    for (const table of ['frete_lancamentos', 'frete_cupons'])
      expect(db[table].findMany.mock.calls[0][0].where).toMatchObject({
        unit: 100,
        placa: 'ABC1234',
        departamento: 'A',
        responsavel_cod: 7,
        pago: false,
        fechamento_id: null,
        created_at: { gte: start, lt: new Date('2026-09-27') },
      });
  });
  it('permite somente cupons e valida seleção vazia e período', async () => {
    const result = await service.financial({ semana: '3926', lancamentos: 'false' }, user);
    expect(result.title).toBe('Conferência de cupons');
    expect(result.rows.every(row => row[0] === 'Cupom')).toBe(true);
    expect(reportHtml(result)).not.toContain('SELECIONADOS');
    expect(db.frete_lancamentos.findMany).not.toHaveBeenCalled();
    await expect(
      service.financial(
        { semana: '3926', lancamentos: 'false', cupons: 'false' },
        user,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.financial({ inicio: '2026-09-26', fim: '2026-09-20' }, user),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.financial({ semana: '3926', inicio: '2026-09-20' }, user),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('relatório de lançamentos não consulta cupons e preserva o resumo fixo', async () => {
    const result = await service.financial({ semana: '3926', cupons: 'false' }, user);
    expect(db.frete_cupons.findMany).not.toHaveBeenCalled();
    expect(result.title).toBe('Conferência de lançamentos');
    expect(result.rows.every(row => row[0] === 'Lançamento')).toBe(true);
    expect(reportHtml(result)).toContain('SELECIONADOS');
  });
  it('planilha usa histórico, exclui frete zero do CTRB e aplica regra VBA sem rateio', async () => {
    const result = await service.payments(
      { semana: '3926', empresa: 'MMA' },
      user,
    );
    expect(result.rows[0]).toEqual([
      'MMA',
      '00123456789',
      'Proprietário original',
      '3926',
      '40',
      'ABC1234',
      '1000.00',
      '200.00',
      '800.00',
      '100.00',
      '700.00',
      '100',
      '150.00',
    ]);
    expect(db.frete_fechamentos.findMany.mock.calls[0][0].where).toMatchObject({
      unit: 100,
      semana: '3926',
      status: 'FECHADO',
    });
    expect(db.frete_carregamento_manifestos.findMany).not.toHaveBeenCalled();
    expect(
      (await service.payments({ semana: '3926', empresa: 'ATT' }, user)).rows,
    ).toHaveLength(0);
    const sheet = reportSpreadsheet(result);
    expect(sheet).toContain('ss:Type="String">00123456789');
    expect(sheet).toContain('ss:Type="Number">700.00');
    expect(sheet).not.toContain('ss:Formula');
  });
  it('reimprime por número usando histórico sem cálculos ou gravações', async () => {
    const html = await service.reprint({ numero: '40' }, user);
    expect(html).toContain('M1');
    expect(html).toContain('40');
    expect(db.frete_fechamentos.findMany.mock.calls[0][0].where).toEqual({
      unit: 100,
      numero: 40,
    });
    expect(db.frete_lancamentos.findMany).not.toHaveBeenCalled();
    db.frete_fechamentos.findMany.mockResolvedValue([]);
    await expect(service.reprint({ numero: '40' }, user)).rejects.toMatchObject(
      { status: 404 },
    );
  });
  it('preserva marca de cancelamento na reimpressão e informa falta de dados legados', async () => {
    const closure = (await db.frete_fechamentos.findMany())[0];
    db.frete_fechamentos.findMany.mockResolvedValue([
      {
        ...closure,
        status: 'CANCELADO',
        historico: {
          finalizacao: { dados: original },
          cancelamento: { motivo: 'Correção' },
        },
      },
    ]);
    expect(await service.reprint({ semana: '3926' }, user)).toContain(
      'CANCELADO',
    );
    db.frete_fechamentos.findMany.mockResolvedValue([
      { ...closure, historico: null },
    ]);
    const r = await service.payments({ semana: '3926' }, user);
    expect(r.rows[0][12]).toBeNull();
    expect(r.notes.join(' ')).toContain('sem cópia original');
  });
});
