import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { FreightInvoicesService } from './freight-invoices.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CouponDto } from './freight-invoices.dto';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

describe('Notas e cupons financeiros', () => {
  const user = { sub: 1, cod: 10, unit: 101, isAdmin: false };
  const dto = {
    placa: 'ABC1234',
    cpf_motorista: '12345678901',
    semana: '2639',
    valor: 30,
  };
  const noteDto = {
    numero: '0001',
    data_nota: '2026-09-22',
    emitido_em: '2026-09-22',
    valor: 100,
    tipo_id: 1,
  };
  let note: any;
  let coupons: any[];
  let db: any;
  let service: FreightInvoicesService;
  const matches = (row: any, where: any) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  beforeEach(() => {
    note = {
      id: 1,
      unit: 101,
      valor: new Decimal(100),
      saldo: new Decimal(100),
      numero: '0001',
    };
    coupons = [];
    const week = {
      codigo: '2639',
      data_inicio: new Date('2026-09-21T00:00:00Z'),
      data_fim: new Date('2026-09-27T00:00:00Z'),
    };
    db = {
      frete_notas: {
        findFirst: jest.fn(async ({ where }) =>
          note && matches(note, where) ? note : null,
        ),
        update: jest.fn(async ({ data }) => (note = { ...note, ...data })),
        create: jest.fn(async ({ data }) => (note = { id: 1, ...data })),
        delete: jest.fn(async () => {
          const old = note;
          note = null;
          return old;
        }),
      },
      frete_cupons: {
        findFirst: jest.fn(
          async ({ where }) =>
            coupons.find((row) => matches(row, where)) ?? null,
        ),
        findMany: jest.fn(async ({ where }) =>
          coupons.filter((row) => matches(row, where)),
        ),
        aggregate: jest.fn(async ({ where }) => ({
          _sum: {
            valor: coupons
              .filter((row) => matches(row, where))
              .reduce((total, row) => total.plus(row.valor), new Decimal(0)),
          },
        })),
        create: jest.fn(async ({ data }) => {
          const row = {
            id: coupons.length + 1,
            pago: false,
            fechamento_id: null,
            ...data,
          };
          coupons.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }) => {
          const row = coupons.find((item) => matches(item, where));
          Object.assign(row, data);
          return row;
        }),
        delete: jest.fn(
          async ({ where }) =>
            coupons.splice(
              coupons.findIndex((row) => matches(row, where)),
              1,
            )[0],
        ),
        deleteMany: jest.fn(async () => {
          const count = coupons.length;
          coupons = [];
          return { count };
        }),
      },
      frete_tipos_nota: {
        findFirst: jest.fn(async () => ({
          id: 1,
          codigo: '0001',
          nome: 'Abastecimento',
          tipo: 'Debito',
        })),
      },
      vehicle: {
        findUnique: jest.fn(async () => ({
          plate: 'ABC1234',
          codVehicleType: 1,
          canceled: false,
        })),
      },
      vehicleType: { findUnique: jest.fn(async () => ({ typeName: 'VAN' })) },
      driver: { findUnique: jest.fn(async () => ({ name: 'Motorista' })) },
      frete_semanas: {
        findUnique: jest.fn(async () => week),
        findMany: jest.fn(async () => [week]),
      },
      frete_fechamentos: { findFirst: jest.fn(async () => null) },
    };
    db.$transaction = jest.fn(async (action) => {
      const oldNote = { ...note };
      const oldCoupons = coupons.map((coupon) => ({ ...coupon }));
      try {
        return await action(db);
      } catch (error) {
        note = oldNote;
        coupons = oldCoupons;
        throw error;
      }
    });
    service = new FreightInvoicesService(db);
  });

  it('primeiro cupom reduz saldo, edição recalcula diferença e exclusão devolve valor', async () => {
    let result = await service.changeCoupon(1, user, { kind: 'create', dto });
    expect(Number(result.nota.saldo)).toBe(70);
    result = await service.changeCoupon(1, user, {
      kind: 'update',
      couponId: 1,
      dto: { ...dto, valor: 40 },
    });
    expect(Number(result.nota.saldo)).toBe(60);
    result = await service.changeCoupon(1, user, {
      kind: 'delete',
      couponId: 1,
    });
    expect(Number(result.nota.saldo)).toBe(100);
  });

  it('formulário integrado cria nota e cupom em uma transação', async () => {
    const result = await service.createLaunch(
      { nota: { ...noteDto, numero: '0002' }, cupom: dto },
      user,
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(result.nota.numero).toBe('0002');
    expect(Number(result.nota.saldo)).toBe(70);
    expect(result.coupon.nota_id).toBe(result.nota.id);
  });
  it('falha do cupom reverte também a criação da nota', async () => {
    await expect(
      service.createLaunch(
        { nota: { ...noteDto, numero: '0002' }, cupom: { ...dto, valor: 101 } },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(note.numero).toBe('0001');
    expect(coupons).toHaveLength(0);
  });
  it('reutiliza nota existente e rejeita alteração silenciosa de seu valor', async () => {
    Object.assign(note, { tipo_id: 1, data_nota: new Date('2026-09-22') });
    await service.createLaunch({ nota: noteDto, cupom: dto }, user);
    expect(db.frete_notas.create).not.toHaveBeenCalled();
    expect(Number(note.saldo)).toBe(70);
    await expect(
      service.createLaunch(
        { nota: { ...noteDto, valor: 200 }, cupom: dto },
        user,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(Number(note.valor)).toBe(100);
    expect(coupons).toHaveLength(1);
  });
  it('busca por número e por lançamento respeita a unidade', async () => {
    expect((await service.findByNumber('0001', user)).id).toBe(1);
    await expect(
      service.findByNumber('0001', { ...user, unit: 102 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await service.changeCoupon(1, user, { kind: 'create', dto });
    expect((await service.findLaunch(1, user)).nota.numero).toBe('0001');
    await expect(
      service.findLaunch(1, { ...user, unit: 102 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('aceita total exato e mantém precisão de centavos', async () => {
    note.valor = new Decimal('0.30');
    await service.changeCoupon(1, user, {
      kind: 'create',
      dto: { ...dto, valor: 0.1 },
    });
    const result = await service.changeCoupon(1, user, {
      kind: 'create',
      dto: { ...dto, valor: 0.2 },
    });
    expect(Number(result.nota.saldo)).toBe(0);
  });
  it('aborta inclusão e edição que ultrapassem o valor da nota', async () => {
    await service.changeCoupon(1, user, { kind: 'create', dto });
    await expect(
      service.changeCoupon(1, user, {
        kind: 'create',
        dto: { ...dto, valor: 71 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.changeCoupon(1, user, {
        kind: 'update',
        couponId: 1,
        dto: { ...dto, valor: 101 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(coupons).toHaveLength(1);
    expect(coupons[0].valor).toBe(30);
    expect(Number(note.saldo)).toBe(70);
  });
  it('não permite reduzir a nota abaixo do total alocado, incluindo cupons pagos', async () => {
    await service.changeCoupon(1, user, { kind: 'create', dto });
    await expect(
      service.save({ ...noteDto, valor: 20 }, user, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
    const updated = await service.save({ ...noteDto, valor: 120 }, user, 1);
    expect(Number(updated.saldo)).toBe(90);
  });
  it.each(['pago', 'fechamento_id'])(
    'bloqueia cupom com %s e a nota correspondente',
    async (field) => {
      await service.changeCoupon(1, user, { kind: 'create', dto });
      coupons[0][field] = field === 'pago' ? true : 10;
      await expect(
        service.changeCoupon(1, user, { kind: 'delete', couponId: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.changeCoupon(1, user, { kind: 'update', couponId: 1, dto }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(service.save(noteDto, user, 1)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(
        service.remove(1, { ...user, isAdmin: true }),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );
  it('recalcula considerando cupons pagos ao adicionar outro cupom', async () => {
    await service.changeCoupon(1, user, { kind: 'create', dto });
    coupons[0].pago = true;
    const result = await service.changeCoupon(1, user, { kind: 'create', dto });
    expect(Number(result.nota.saldo)).toBe(40);
  });
  it('isola leitura e escrita por unidade', async () => {
    const other = { ...user, unit: 202 };
    await expect(service.findOne(1, other)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.listCoupons(1, other)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.changeCoupon(1, other, { kind: 'create', dto }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('não altera cupom de outra nota', async () => {
    coupons.push({ id: 2, nota_id: 2, unit: 101 });
    await expect(
      service.changeCoupon(1, user, { kind: 'delete', couponId: 2 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('exclusão de nota é administrativa e remove cupons abertos', async () => {
    await service.changeCoupon(1, user, { kind: 'create', dto });
    await expect(service.remove(1, user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(await service.remove(1, { ...user, isAdmin: true })).toEqual({
      id: 1,
      deleted: true,
      deletedCoupons: 1,
    });
    expect(coupons).toHaveLength(0);
  });
  it('reverte cupons se exclusão da nota falhar', async () => {
    await service.changeCoupon(1, user, { kind: 'create', dto });
    db.frete_notas.delete.mockRejectedValue({ code: 'P2003' });
    await expect(
      service.remove(1, { ...user, isAdmin: true }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(coupons).toHaveLength(1);
  });
  it('respeita bloqueio de período da placa', async () => {
    db.frete_fechamentos.findFirst.mockResolvedValue({ id: 1 });
    await expect(
      service.changeCoupon(1, user, { kind: 'create', dto }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('repete conflito de serialização', async () => {
    db.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    await service.changeCoupon(1, user, { kind: 'create', dto });
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });
  it.each([
    { valor: -1 },
    { valor: 0 },
    { valor: 0.001 },
    { semana: '123' },
    { placa: 'INVALIDA' },
  ])('rejeita DTO inválido: %j', async (invalid) => {
    expect(
      (await validate(plainToInstance(CouponDto, { ...dto, ...invalid })))
        .length,
    ).toBeGreaterThan(0);
  });
});
