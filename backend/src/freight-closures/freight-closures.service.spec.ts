import { Decimal } from '@prisma/client/runtime/client';
import { FreightClosuresService } from './freight-closures.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FreightClosuresService', () => {
  const user = { sub: 1, cod: 1, unit: 2, isAdmin: false };
  const dto = { semana: '0001', placa: 'ABC1234' };
  let db: any;
  let service: FreightClosuresService;
  beforeEach(() => {
    const table = (rows: any[] = []) => ({
      findMany: jest.fn().mockResolvedValue(rows),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: rows.length }),
    });
    db = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          first_payer: 'A',
          second_payer: 'B',
          second_payer_percent: new Decimal('0.3'),
        }),
      },
      frete_semanas: {
        findUnique: jest.fn().mockResolvedValue({
          codigo: '0001',
          data_inicio: new Date('2026-09-21'),
          data_fim: new Date('2026-09-27'),
        }),
      },
      frete_carregamento_manifestos: table([
        {
          id: 10,
          num_fechamento: 10001,
          frete_veiculo: new Decimal(100),
          ctrb_total: new Decimal(200),
        },
      ]),
      frete_lancamentos: table(
        ['Credito', 'Debito', 'Adiantamento'].map((tipo_despesa, index) => ({
          id: index + 1,
          unit: 2,
          placa: dto.placa,
          pago: false,
          fechamento_id: null,
          tipo_despesa,
          valor: new Decimal([20, 10, 50][index]),
        })),
      ),
      frete_cupons: table([{ id: 20, valor: new Decimal(30) }]),
      frete_fechamentos: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        aggregate: jest.fn().mockResolvedValue({ _max: { numero: 5 } }),
        create: jest.fn().mockResolvedValue({ id: 6, numero: 10001 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    db.$transaction = jest.fn((work) => work(db));
    service = new FreightClosuresService(db as PrismaService);
  });
  it('soma créditos uma vez e desconta débito e cupom, sem subtrair adiantamento ou CTRB', async () => {
    const result = await service.preview(dto, user);
    expect(result.totals.total_bruto.toString()).toBe('120');
    expect(result.totals.total_liquido.toString()).toBe('80');
    expect(result.totals.total_ctrb.toString()).toBe('200');
    expect(db.frete_fechamentos.create).not.toHaveBeenCalled();
  });
  it('finaliza os três conjuntos na transação serializável', async () => {
    await service.finalize(dto, user);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(db.frete_fechamentos.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        unit: 2,
        numero: 10001,
        status: 'FECHADO',
      }),
    });
    expect(db.frete_carregamento_manifestos.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { fechamento_id: 6, num_fechamento: 10001 },
      }),
    );
    expect(db.frete_cupons.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { fechamento_id: 6, pago: true } }),
    );
  });
  it('mantem debito desmarcado em aberto para proximo fechamento', async () => {
    db.frete_lancamentos.updateMany.mockResolvedValueOnce({ count: 2 });
    const result = await service.finalize(
      { ...dto, debit_entry_ids: [] },
      user,
    );
    expect(result.totals.total_liquido.toString()).toBe('90');
    expect(db.frete_lancamentos.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [1, 3] } }),
      }),
    );
  });
  it.each([
    { unit: 3 },
    { pago: true },
    { fechamento_id: 8 },
    { placa: 'XYZ1234' },
    { tipo_despesa: 'Outro' },
  ])('rejeita vínculo inconsistente %j antes de gravar', async (change) => {
    db.frete_lancamentos.findMany.mockResolvedValue([
      {
        unit: 2,
        placa: dto.placa,
        pago: false,
        fechamento_id: null,
        tipo_despesa: 'Credito',
        ...change,
      },
    ]);
    await expect(service.finalize(dto, user)).rejects.toMatchObject({
      status: 409,
    });
    expect(db.frete_fechamentos.create).not.toHaveBeenCalled();
  });
  it('rejeita fechamento vazio, inclusive repetição sem registros abertos', async () => {
    for (const name of [
      'frete_carregamento_manifestos',
      'frete_lancamentos',
      'frete_cupons',
    ])
      db[name].findMany.mockResolvedValue([]);
    await expect(service.finalize(dto, user)).rejects.toMatchObject({
      status: 400,
    });
  });
  it('aborta se algum registro não puder ser marcado', async () => {
    db.frete_cupons.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.finalize(dto, user)).rejects.toMatchObject({
      status: 409,
    });
  });
  it('grava pagamento integral sem o rateio antigo', async () => {
    db.frete_carregamento_manifestos.findMany.mockResolvedValue([
      {
        id: 10,
        num_fechamento: 10001,
        frete_veiculo: new Decimal(2020),
        ctrb_total: new Decimal(0),
        ctrb_numero: null,
      },
    ]);
    const result = await service.finalize(dto, user);
    expect(result.payment.primeira.valor.toString()).toBe('2000');
    expect(result.payment.segunda.valor.toString()).toBe('0');
    const history = db.frete_fechamentos.create.mock.calls[0][0].data.historico;
    expect(history.finalizacao.dados.payment.segunda).toEqual({
      empresa: null,
      valor: '0',
    });
  });
  it('ignora os campos antigos da segunda pagadora nos novos fechamentos', async () => {
    db.vehicle.findUnique.mockResolvedValue({
      first_payer: null,
      second_payer: 'B',
      second_payer_percent: new Decimal('.3'),
    });
    const result = await service.finalize(dto, user);
    expect(result.payment.segunda.valor.toString()).toBe('0');
    expect(result.payment.criterio).toBe('INTEGRAL');
  });
  it('não consulta detalhes de fechamento de outra unidade', async () => {
    await expect(service.findOne(9, user)).rejects.toMatchObject({
      status: 404,
    });
    expect(db.frete_fechamentos.findFirst).toHaveBeenCalledWith({
      where: { id: 9, unit: 2 },
    });
    expect(db.frete_cupons.findMany).not.toHaveBeenCalled();
  });
  it('limita as tentativas após conflitos concorrentes', async () => {
    db.$transaction.mockRejectedValue({ code: 'P2034' });
    await expect(service.finalize(dto, user)).rejects.toMatchObject({
      status: 409,
    });
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });

  it('fecha todas as placas numa única transação e propaga falha para rollback', async () => {
    db.frete_carregamento_manifestos.findMany.mockResolvedValue([
      { placa: 'ABC1234' },
      { placa: 'XYZ1234' },
    ]);
    db.frete_lancamentos.findMany.mockResolvedValue([]);
    db.frete_cupons.findMany.mockResolvedValue([]);
    const finalize = jest
      .spyOn(service as any, 'finalizeTransaction')
      .mockResolvedValueOnce({ closure: { id: 1 } })
      .mockRejectedValueOnce(new Error('falha no segundo veículo'));
    await expect(service.finalizeWeek(dto.semana, user)).rejects.toThrow(
      'falha no segundo veículo',
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      timeout: 60000,
    });
    expect(finalize).toHaveBeenNthCalledWith(
      1,
      db,
      { semana: dto.semana, placa: 'ABC1234' },
      user,
    );
    expect(finalize).toHaveBeenNthCalledWith(
      2,
      db,
      { semana: dto.semana, placa: 'XYZ1234' },
      user,
    );
    expect(
      db.frete_carregamento_manifestos.findMany.mock.calls[0][0].where.unit,
    ).toBe(2);
  });

  describe('cancelamento', () => {
    const admin = { ...user, isAdmin: true };
    beforeEach(() => {
      db.frete_fechamentos.findFirst.mockResolvedValue({
        id: 6,
        numero: 6,
        unit: 2,
        placa: dto.placa,
        status: 'FECHADO',
        historico: { versao: 1, finalizacao: { em: 'original' } },
      });
      db.frete_carregamento_manifestos.findMany.mockResolvedValue([
        { id: 10, unit: 2, placa: dto.placa, num_fechamento: 6 },
      ]);
      db.frete_lancamentos.findMany.mockResolvedValue(
        [1, 2, 3].map((id) => ({ id, unit: 2, placa: dto.placa, pago: true })),
      );
      db.frete_cupons.findMany.mockResolvedValue([
        {
          id: 20,
          unit: 2,
          placa: dto.placa,
          pago: true,
          valor: new Decimal('30.10'),
        },
      ]);
    });
    it('exige administrador antes de acessar o banco', () => {
      expect(() => service.cancel(6, { motivo: 'Correção' }, user)).toThrow(
        'Somente administrador',
      );
      expect(db.$transaction).not.toHaveBeenCalled();
    });
    it('exige motivo não vazio', () => {
      expect(() => service.cancel(6, { motivo: '  ' }, admin)).toThrow(
        'Informe o motivo',
      );
    });
    it('preserva a finalização e os registros antes de reabrir', async () => {
      const result = await service.cancel(6, { motivo: '  Correção  ' }, admin);
      const history = result.closure.historico as any;
      expect(history.finalizacao.em).toBe('original');
      expect(history.cancelamento.motivo).toBe('Correção');
      expect(history.cancelamento.usuario.cod).toBe(user.cod);
      expect(history.cancelamento.dados.coupons[0].valor).toBe('30.1');
      expect(result.reabertos).toEqual({
        manifests: 1,
        entries: 3,
        coupons: 1,
      });
      expect(db.frete_carregamento_manifestos.updateMany).toHaveBeenCalledWith({
        where: { fechamento_id: 6, unit: 2 },
        data: { fechamento_id: null, num_fechamento: 6 },
      });
    });
    it('aceita fechamento legado sem histórico', async () => {
      db.frete_fechamentos.findFirst.mockResolvedValue({
        id: 6,
        numero: 6,
        unit: 2,
        placa: dto.placa,
        status: 'FECHADO',
        historico: null,
      });
      const result = await service.cancel(6, { motivo: 'Legado' }, admin);
      expect((result.closure.historico as any).finalizacao).toBeUndefined();
      expect(
        (result.closure.historico as any).cancelamento.dados.manifests,
      ).toHaveLength(1);
    });
    it.each(['CANCELADO', 'ABERTO'])(
      'não cancela status %s',
      async (status) => {
        db.frete_fechamentos.findFirst.mockResolvedValue({ status });
        await expect(
          service.cancel(6, { motivo: 'Correção' }, admin),
        ).rejects.toMatchObject({ status: 409 });
        expect(db.frete_fechamentos.updateMany).not.toHaveBeenCalled();
      },
    );
    it('não cancela fechamento de outra unidade', async () => {
      db.frete_fechamentos.findFirst.mockResolvedValue(null);
      await expect(
        service.cancel(6, { motivo: 'Correção' }, admin),
      ).rejects.toMatchObject({ status: 404 });
    });
    it('aborta quando há vínculo entre unidades', async () => {
      db.frete_cupons.findMany.mockResolvedValue([
        { unit: 3, placa: dto.placa, pago: true },
      ]);
      await expect(
        service.cancel(6, { motivo: 'Correção' }, admin),
      ).rejects.toMatchObject({ status: 409 });
      expect(db.frete_fechamentos.updateMany).not.toHaveBeenCalled();
    });
    it('aborta toda a operação quando a contagem diverge', async () => {
      db.frete_cupons.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.cancel(6, { motivo: 'Correção' }, admin),
      ).rejects.toMatchObject({ status: 409 });
    });
  });
});
