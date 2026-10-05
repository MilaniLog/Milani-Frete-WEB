import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WeeksService } from './weeks.service';
import { assertPeriodWritable, periodForDate } from './period-policy';
import { WeekDto } from './weeks.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

describe('Semanas e períodos', () => {
  const admin = { sub: 1, cod: 10, unit: 101, isAdmin: true };
  const regular = { ...admin, isAdmin: false };
  const dto = {
    codigo: '3926',
    data_inicio: '2026-09-20',
    data_fim: '2026-09-26',
  };
  const week = {
    codigo: dto.codigo,
    data_inicio: new Date(`${dto.data_inicio}T00:00:00Z`),
    data_fim: new Date(`${dto.data_fim}T00:00:00Z`),
  };
  let db: any;
  let service: WeeksService;
  beforeEach(() => {
    db = {
      frete_semanas: {
        findUnique: jest.fn(async () => week),
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async ({ where }) =>
          where.data_inicio.lte >= week.data_inicio &&
          where.data_fim.gte <= week.data_fim
            ? [week]
            : [],
        ),
        create: jest.fn(async ({ data }) => data),
        update: jest.fn(async ({ data }) => data),
      },
      frete_fechamentos: { findFirst: jest.fn(async () => null) },
      frete_cupons: { findFirst: jest.fn(async () => null) },
      frete_lancamentos: { findFirst: jest.fn(async () => null) },
      frete_carregamento_manifestos: { findFirst: jest.fn(async () => null) },
    };
    db.$transaction = jest.fn(async (action) => action(db));
    service = new WeeksService(db);
  });

  it('cadastra sete dias inclusivos em UTC', async () => {
    expect(await service.save(dto, admin)).toEqual(week);
  });
  it('rejeita segunda a domingo mesmo com sete dias', async () => {
    await expect(
      service.save(
        { ...dto, data_inicio: '2026-09-21', data_fim: '2026-09-27' },
        admin,
      ),
    ).rejects.toThrow('A semana deve começar no domingo e terminar no sábado.');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('impede usuário comum de alterar calendário compartilhado', async () => {
    await expect(service.save(dto, regular)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each(['2026-09-19', '2026-09-25', '2026-09-27'])(
    'rejeita fim inválido %s',
    async (data_fim) => {
      await expect(
        service.save({ ...dto, data_fim }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('rejeita sobreposição', async () => {
    db.frete_semanas.findFirst.mockResolvedValue(week);
    await expect(service.save(dto, admin)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.frete_semanas.create).not.toHaveBeenCalled();
  });
  it('não permite renumerar uma semana', async () => {
    await expect(service.save(dto, admin, '4026')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it.each([
    'frete_carregamento_manifestos',
    'frete_lancamentos',
    'frete_fechamentos',
    'frete_cupons',
  ])('bloqueia alteração se houver uso em %s', async (table) => {
    db[table].findFirst.mockResolvedValue({ id: 1 });
    await expect(
      service.save(
        { ...dto, data_inicio: '2026-09-27', data_fim: '2026-10-03' },
        admin,
        dto.codigo,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('permite manter as mesmas datas de semana utilizada', async () => {
    expect(await service.save(dto, admin, dto.codigo)).toEqual(week);
    expect(db.frete_semanas.update).not.toHaveBeenCalled();
  });
  it.each(['2026-09-20', '2026-09-26'])(
    'inclui a borda %s no período',
    async (date) => {
      expect(await periodForDate(db, new Date(`${date}T00:00:00Z`))).toEqual(
        week,
      );
    },
  );
  it.each(['2026-09-19', '2026-09-27'])(
    'rejeita data fora de semana: %s',
    async (date) => {
      await expect(
        periodForDate(db, new Date(`${date}T00:00:00Z`)),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('rejeita código de semana que não corresponde à data', async () => {
    await expect(
      periodForDate(db, week.data_inicio, '4026'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejeita calendário legado ambíguo', async () => {
    db.frete_semanas.findMany.mockResolvedValue([
      week,
      { ...week, codigo: '4026' },
    ]);
    await expect(periodForDate(db, week.data_inicio)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('bloqueia período fechado para usuário comum por placa/unidade', async () => {
    db.frete_fechamentos.findFirst.mockResolvedValue({ id: 1 });
    await expect(
      assertPeriodWritable(db, week.data_inicio, 'ABC1234', regular),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.frete_fechamentos.findFirst).toHaveBeenCalledWith({
      where: {
        unit: 101,
        placa: 'ABC1234',
        status: { notIn: ['ABERTO', 'CANCELADO'] },
        OR: [
          { semana: '3926' },
          {
            periodo_inicio: { lte: week.data_fim },
            periodo_fim: { gte: week.data_inicio },
          },
        ],
      },
      select: { id: true },
    });
  });
  it('permite intervenção administrativa no período', async () => {
    db.frete_fechamentos.findFirst.mockResolvedValue({ id: 1 });
    expect(
      await assertPeriodWritable(db, week.data_inicio, 'ABC1234', admin),
    ).toEqual(week);
  });
  it('retorna 404 para código não cadastrado', async () => {
    db.frete_semanas.findUnique.mockResolvedValue(null);
    await expect(service.findOne('0000')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it.each([
    { codigo: '123' },
    { data_inicio: '2026-02-30' },
    { data_inicio: '2026-09-20T00:00:00Z' },
  ])('valida DTO: %j', async (invalid) => {
    expect(
      (await validate(plainToInstance(WeekDto, { ...dto, ...invalid }))).length,
    ).toBeGreaterThan(0);
  });
});
