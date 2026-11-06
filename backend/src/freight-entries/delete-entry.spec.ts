import { FreightEntriesService } from './freight-entries.service';
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
describe('Excluir vale pelo formulário', () => {
  const user = { sub: 1, cod: 1, unit: 100, isAdmin: false };
  let db: any, service: FreightEntriesService, entry: any;
  beforeEach(() => {
    entry = {
      id: 4,
      numero: 12,
      unit: 100,
      manifesto_id: null,
      placa: 'ABC1234',
      semana: '3926',
      data_lancamento: new Date('2026-09-21'),
      pago: false,
      fechamento_id: null,
      cancelado: false,
    };
    db = {
      frete_lancamentos: {
        findFirst: jest.fn(async ({ where }) =>
          Object.entries(where).every(([k, v]) => entry[k] === v)
            ? entry
            : null,
        ),
        update: jest.fn(async ({ data }) => Object.assign(entry, data)),
      },
      frete_faturas_vales: {
        update: jest.fn(async ({ data }) => data),
      },
      frete_semanas: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              codigo: '3926',
              data_inicio: new Date('2026-09-20'),
              data_fim: new Date('2026-09-26'),
            },
          ]),
      },
      frete_fechamentos: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    db.$transaction = jest.fn((work) => work(db));
    service = new FreightEntriesService(db, {} as any);
  });
  it('exclui avulso em transação e limita a unidade', async () => {
    await service.removeStandalone(4, user);
    expect(db.frete_lancamentos.update).toHaveBeenCalledWith({
      where: {
        id: 4,
        unit: 100,
        manifesto_id: null,
        pago: false,
        fechamento_id: null,
      },
      data: expect.objectContaining({
        cancelado: true,
        cancelado_por: 1,
        cancelado_em: expect.any(Date),
      }),
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it.each([{ pago: true }, { fechamento_id: 9 }])(
    'bloqueia registro pago/fechado %j',
    async (change) => {
      Object.assign(entry, change);
      await expect(service.removeStandalone(4, user)).rejects.toMatchObject({
        status: 409,
      });
      expect(db.frete_lancamentos.update).not.toHaveBeenCalled();
    },
  );
  it('permite excluir registro aberto mesmo com fechamento anterior na placa', async () => {
    db.frete_fechamentos.findFirst.mockResolvedValue({ id: 9 });
    await expect(service.removeStandalone(4, user)).resolves.toMatchObject({
      entry: { id: 4 },
    });
    expect(db.frete_lancamentos.update).toHaveBeenCalled();
  });
  it('permite cancelar vale incluído em fechamento de vale e recalcula o total', async () => {
    Object.assign(entry, { fatura_id: 7, numero_fatura: 12, valor: 50 });
    db.frete_lancamentos.findMany = jest.fn().mockResolvedValue([]);
    await expect(service.removeStandalone(4, user)).resolves.toBeDefined();
    expect(db.frete_faturas_vales.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({ quantidade: 0, alterado_por: user.cod }),
    });
  });
  it('não exclui de outra unidade', async () => {
    await expect(
      service.removeStandalone(4, { ...user, unit: 101 }),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('usa exclusão com recálculo para vínculo ao manifesto', async () => {
    entry.manifesto_id = 8;
    const linked = jest
      .spyOn(service, 'changeEntry')
      .mockResolvedValue({} as any);
    await service.removeStandalone(4, user);
    expect(linked).toHaveBeenCalledWith(8, user, { kind: 'delete', id: 4 });
  });
});
