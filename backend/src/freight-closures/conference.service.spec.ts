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
    expect(
      (await service.report({ semana: '3926', despesa: '999' }, user)).groups,
    ).toHaveLength(0);
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
    for (const table of [
      'frete_carregamento_manifestos',
      'frete_lancamentos',
      'frete_cupons',
    ])
      expect(db[table].findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ unit: 2, fechamento_id: null }),
        }),
      );
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
  it('incluir finalizados remove apenas a restrição de pagamento e mantém a unidade', async () => {
    await service.report(
      { inicio: '2026-09-20', fim: '2026-09-26', finalizados: 'true' },
      user,
    );
    const where = db.frete_cupons.findMany.mock.calls[0][0].where;
    expect(where.unit).toBe(2);
    expect(where.pago).toBeUndefined();
    expect(where.data_cobranca.lte).toEqual(new Date('2026-09-26'));
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
      { manifesto_id: { in: [1] } },
    ]);
  });
});
