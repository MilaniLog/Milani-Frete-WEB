import { ConferenceService } from './conference.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Conferência VBA', () => {
  const user = { sub: 1, cod: 7, unit: 2, isAdmin: false };
  let db: any;
  let service: ConferenceService;
  it('arredonda o resultado depois da soma, como a finalização', async () => {
    db.frete_carregamento_manifestos.findMany.mockResolvedValue([
      { id: 1, placa: 'ABC1234', frete_veiculo: '100.005', ctrb_total: '0' },
    ]);
    db.frete_lancamentos.findMany.mockResolvedValue([
      { id: 2, placa: 'ABC1234', tipo_despesa: 'Credito', valor: '0.005' },
    ]);
    db.frete_cupons.findMany.mockResolvedValue([]);
    const result = await service.report({ semana: '3926' }, user);
    expect(result.groups[0].totals.total_bruto.toString()).toBe('100.01');
    expect(result.groups[0].totals.total_liquido.toString()).toBe('100.01');
  });
  beforeEach(() => {
    db = {
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          {
            plate: 'ABC1234',
            codVehicleType: 10,
            empresa_sigla: 'MMA',
            first_payer: 'ANTIGA',
          },
        ]),
      },
      frete_semanas: {
        findUnique: jest.fn().mockResolvedValue({
          codigo: '3926',
          data_inicio: new Date('2026-09-20'),
          data_fim: new Date('2026-09-26'),
        }),
      },
      frete_carregamento_manifestos: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            placa: 'ABC1234',
            frete_veiculo: '2000.10',
            ctrb_total: '100',
            ctrb_numero: '001',
            num_fechamento: 39260001,
          },
        ]),
      },
      frete_lancamentos: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 2,
            placa: 'ABC1234',
            codigo_despesa: '1',
            tipo_despesa: 'Debito',
            valor: '0.20',
          },
          {
            id: 3,
            placa: 'ABC1234',
            codigo_despesa: '2',
            tipo_despesa: 'Credito',
            valor: '0.10',
          },
        ]),
      },
      frete_cupons: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 4, placa: 'ABC1234', valor: '50' }]),
      },
      frete_fechamentos: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    db.$transaction = jest.fn((work) => work(db));
    service = new ConferenceService(db as PrismaService);
  });
  it.each([
    {},
    { inicio: '2026-09-20' },
    { fim: '2026-09-26' },
    { semana: '3926', inicio: '2026-09-20', fim: '2026-09-26' },
  ])('rejeita seleção de período incompleta ou ambígua %j', async (dto) => {
    await expect(service.report(dto, user)).rejects.toMatchObject({
      status: 400,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('filtra a placa pela despesa e preserva os demais valores, sem rateio ou desconto duplicado do CTRB', async () => {
    const result = await service.report({ semana: '3926', despesa: '1' }, user);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].entries).toHaveLength(2);
    expect(result.groups[0].totals.total_liquido.toString()).toBe('1950');
    expect(result.groups[0].payment.primeira.empresa).toBe('MMA');
    expect(result.groups[0].payment.primeira.valor.toString()).toBe('1950');
    expect(result.groups[0].payment.segunda.valor.toString()).toBe('0');
    expect(result.groups[0].closureNumber).toBe(39260001);
    expect(
      (await service.report({ semana: '3926', despesa: '999' }, user)).groups,
    ).toHaveLength(0);
  });
  it('mantem o total CTRB integral com debito de codigo 3333', async () => {
    db.frete_lancamentos.findMany.mockResolvedValue([
      {
        id: 2,
        placa: 'ABC1234',
        codigo_despesa: '3333',
        tipo_despesa: 'Debito',
        valor: '30',
      },
    ]);
    const result = await service.report({ semana: '3926' }, user);
    expect(result.groups[0].totals.total_ctrb.toString()).toBe('100');
  });
  it('consulta todo débito aberto e inclui créditos vinculados aos manifestos da semana', async () => {
    await service.report({ semana: '3926' }, user);
    expect(db.frete_lancamentos.findMany.mock.calls[0][0].where.OR).toEqual(
      expect.arrayContaining([
        { tipo_despesa: 'Debito', codigo_despesa: { not: '3333' } },
        {
          codigo_despesa: '3333',
          OR: [
            { manifesto_id: { in: [1] } },
            { manifesto_id: null, manifesto_numero: { in: [] } },
          ],
        },
        {
          tipo_despesa: { in: ['Credito', 'Adiantamento'] },
          OR: [
            { manifesto_id: { in: [1] } },
            { manifesto_id: null, manifesto_numero: { in: [] } },
            {
              manifesto_id: null,
              manifesto_numero: null,
              data_lancamento: {
                gte: new Date('2026-09-20'),
                lte: new Date('2026-09-26'),
              },
            },
          ],
        },
      ]),
    );
  });
  it('consulta cupons abertos de qualquer semana', async () => {
    await service.report({ semana: '3926' }, user);

    expect(db.frete_cupons.findMany).toHaveBeenCalledWith({
      include: {
        nota: { select: { codigo_tipo: true, nome_tipo: true } },
      },
      where: {
        placa: { in: ['ABC1234'] },
        fechamento_id: null,
        pago: false,
      },
      orderBy: { id: 'asc' },
    });
  });
  it('mostra credito extra vinculado a manifesto fechado sem repetir o frete', async () => {
    db.frete_carregamento_manifestos.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 90,
          unit: 2,
          manifestos: '000123-4',
          manifesto_adicional_1: null,
          manifesto_adicional_2: null,
          manifesto_adicional_3: null,
        },
      ]);
    db.frete_lancamentos.findMany.mockResolvedValue([
      {
        id: 20,
        unit: 2,
        placa: 'ABC1234',
        motorista: 'Motorista',
        manifesto_id: 90,
        manifesto_numero: '000123-4',
        tipo_despesa: 'Credito',
        codigo_despesa: '0060',
        valor: '80',
      },
    ]);
    db.frete_cupons.findMany.mockResolvedValue([]);

    const result = await service.report({ semana: '3926' }, user);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].manifests).toHaveLength(0);
    expect(result.groups[0].entries[0].manifesto_numero).toBe('000123-4');
    expect(result.groups[0].totals.fretes.toString()).toBe('0');
    expect(result.groups[0].totals.total_liquido.toString()).toBe('80');
    expect(result.groups[0].isClosed).toBe(false);
  });
  it('preserva o numero do manifesto de outra semana no debito aberto', async () => {
    db.frete_lancamentos.findMany.mockResolvedValue([
      {
        id: 20,
        placa: 'ABC1234',
        codigo_despesa: '1000',
        tipo_despesa: 'Debito',
        valor: '25',
        manifesto_id: 99,
        manifesto_numero: null,
      },
    ]);
    db.frete_carregamento_manifestos.findMany
      .mockResolvedValueOnce([
        { id: 1, placa: 'ABC1234', manifestos: '100000001-1', frete_veiculo: '2000.10' },
      ])
      .mockResolvedValueOnce([
        { id: 1, unit: 2, placa: 'ABC1234', manifestos: '100000001-1', frete_veiculo: '2000.10' },
      ])
      .mockResolvedValueOnce([{ id: 99, manifestos: '100000999-9' }]);
    const result = await service.report({ semana: '3926' }, user);
    expect(result.groups[0].entries[0]).toMatchObject({
      manifesto_id: 99,
      manifesto_numero: '100000999-9',
    });
    expect(result.groups[0].manifests).toHaveLength(1);
  });
  it('nao inclui placa que tenha somente debitos antigos e nenhum manifesto aberto na semana', async () => {
    db.vehicle.findMany.mockResolvedValue([
      {
        plate: 'ABC1234',
        codVehicleType: 10,
        empresa_sigla: 'MMA',
        first_payer: 'ANTIGA',
      },
      {
        plate: 'SEM1234',
        codVehicleType: 10,
        empresa_sigla: 'MMA',
        first_payer: 'ANTIGA',
      },
    ]);
    db.frete_lancamentos.findMany.mockResolvedValue([
      {
        id: 20,
        placa: 'ABC1234',
        codigo_despesa: '1000',
        tipo_despesa: 'Debito',
        valor: '25',
      },
      {
        id: 21,
        placa: 'SEM1234',
        codigo_despesa: '1000',
        tipo_despesa: 'Debito',
        valor: '30',
        manifesto_id: 99,
        manifesto_numero: '100000999-9',
      },
    ]);

    const result = await service.report({ semana: '3926' }, user);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].placa).toBe('ABC1234');
    expect(result.groups[0].entries).toHaveLength(1);
  });
  it('não leva crédito de manifesto de SP para a consulta de VIX', async () => {
    db.branches = {
      findMany: jest.fn().mockResolvedValue([{ unit: 850 }]),
    };
    db.frete_carregamento_manifestos.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 90,
          unit: 100,
          manifestos: '00018334-2',
          manifesto_adicional_1: null,
          manifesto_adicional_2: null,
          manifesto_adicional_3: null,
        },
      ]);
    db.frete_lancamentos.findMany.mockResolvedValue([
      {
        id: 504,
        unit: 100,
        placa: 'ABC1234',
        manifesto_id: 90,
        manifesto_numero: '00018334-2',
        codigo_despesa: '0060',
        tipo_despesa: 'Credito',
        valor: '80',
      },
    ]);
    db.frete_cupons.findMany.mockResolvedValue([]);

    const result = await service.report(
      { semana: '3926', local: 'VIX' },
      { ...user, isAdmin: true },
    );

    expect(result.groups).toHaveLength(0);
    expect(db.branches.findMany).toHaveBeenCalledWith({
      where: { branch: 'VIX' },
      select: { unit: true },
    });
  });
  it('aplica unidade e usuário aos três conjuntos, categoria e ordenação', async () => {
    await service.report(
      {
        semana: '3926',
        usuario: '7',
        categoria: 'Agregado',
        ordenar_data: 'true',
      },
      user,
    );
    expect(db.frete_carregamento_manifestos.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ unit: 2, fechamento_id: null }),
      }),
    );
    expect(db.frete_lancamentos.findMany.mock.calls[0][0].where.unit).toBeUndefined();
    expect(db.frete_lancamentos.findMany.mock.calls[0][0].where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tipo_despesa: { in: ['Credito', 'Adiantamento'] },
        }),
      ]),
    );
    expect(
      db.frete_lancamentos.findMany.mock.calls[0][0].where.OR.some(
        (condition: { unit?: number }) => condition.unit != null,
      ),
    ).toBe(false);
    expect(db.frete_cupons.findMany.mock.calls[0][0].where.unit).toBeUndefined();
    expect(
      db.frete_lancamentos.findMany.mock.calls[0][0].where.responsavel_cod,
    ).toBe(7);
    expect(
      db.frete_carregamento_manifestos.findMany.mock.calls[0][0].where.usuario,
    ).toBe('7');
    expect(db.vehicle.findMany.mock.calls[0][0].where.codVehicleType).toEqual({
      lt: 100,
    });
    expect(
      db.frete_carregamento_manifestos.findMany.mock.calls[0][0].orderBy,
    ).toEqual([{ semana: 'asc' }, { manifestos: 'asc' }]);
  });
  it('mostrar fechamento busca somente registros vinculados a fechamento', async () => {
    await service.report(
      { inicio: '2026-09-20', fim: '2026-09-26', finalizados: 'true' },
      user,
    );
    const where = db.frete_cupons.findMany.mock.calls[0][0].where;
    expect(where.unit).toBeUndefined();
    expect(where.fechamento_id).toEqual({ not: null });
    expect(where.data_cobranca.lte).toEqual(new Date('2026-09-26'));
    expect(
      db.frete_carregamento_manifestos.findMany.mock.calls[0][0].where
        .fechamento_id,
    ).toEqual({ not: null });
    expect(
      db.frete_lancamentos.findMany.mock.calls[0][0].where.fechamento_id,
    ).toEqual({ not: null });
  });
  it('não revela fechamento numerado de outra unidade', async () => {
    await expect(
      service.report({ semana: '3926', numero: '40' }, user),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.frete_fechamentos.findFirst).toHaveBeenCalledWith({
      where: { unit: 2, numero: 40 },
    });
    expect(db.vehicle.findMany).not.toHaveBeenCalled();
  });
  it('carga mista considera mais de um tipo de carga e não soma cupons sem vínculo', async () => {
    db.frete_carregamento_manifestos.findMany.mockResolvedValue([
      {
        id: 1,
        placa: 'ABC1234',
        frete_veiculo: '100',
        cod_777_00: '1',
        cod_888_00: '2',
        cod_999_00: '0',
      },
    ]);
    const result = await service.report(
      { semana: '3926', mista: 'true' },
      user,
    );
    expect(result.groups[0].manifests).toHaveLength(1);
    expect(db.frete_cupons.findMany).not.toHaveBeenCalled();
    expect(db.frete_lancamentos.findMany.mock.calls[0][0].where.OR).toEqual([
      { tipo_despesa: 'Debito', codigo_despesa: { not: '3333' } },
      {
        codigo_despesa: '3333',
        OR: [
          { manifesto_id: { in: [1] } },
          { manifesto_id: null, manifesto_numero: { in: [] } },
        ],
      },
      {
        tipo_despesa: { in: ['Credito', 'Adiantamento'] },
        OR: [
          { manifesto_id: { in: [1] } },
          { manifesto_id: null, manifesto_numero: { in: [] } },
          {
            manifesto_id: null,
            manifesto_numero: null,
            data_lancamento: {
              gte: new Date('2026-09-20'),
              lte: new Date('2026-09-26'),
            },
          },
        ],
      },
    ]);
  });
});
