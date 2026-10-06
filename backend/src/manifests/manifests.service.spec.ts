import { ConflictException, NotFoundException } from '@nestjs/common';
import { ManifestsService } from './manifests.service';
import { FreightCalculationService } from '../freight-calculation/freight-calculation.service';
import { CreateManifestDto } from './dto/create-manifest.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

it('filtra inclusões de ontem e hoje no horário de São Paulo antes do limite', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-01T01:00:00Z'));
  try {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ManifestsService({ frete_carregamento_manifestos: { findMany } } as any, {} as any);
    await service.findAll({ sub: 1, cod: 1, unit: 100, isAdmin: false }, undefined, undefined, true);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { unit: 100, data_hora: { gte: new Date('2026-09-29T03:00:00Z'), lt: new Date('2026-10-01T03:00:00Z') } },
      take: 50,
    }));
  } finally { jest.useRealTimers(); }
});

describe('Manutenção de manifestos', () => {
  it('busca por número antes do limite, preservando o escopo da unidade', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const lookup = new ManifestsService(
      { frete_carregamento_manifestos: { findMany } } as any,
      {} as any,
    );
    await lookup.findAll(
      { sub: 1, cod: 10, unit: 301, isAdmin: true },
      undefined,
      '301000123-4',
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          unit: 301,
          OR: [
            { manifestos: '301000123-4' },
            { manifesto_adicional_1: '301000123-4' },
            { manifesto_adicional_2: '301000123-4' },
            { manifesto_adicional_3: '301000123-4' },
          ],
        },
        take: 50,
      }),
    );
  });
  const user = { sub: 1, cod: 10, unit: 101, isAdmin: false };
  const dto: CreateManifestDto = {
    semana: '2026-09-22',
    hora: '10:00',
    manifestos: '101000002-1',
    placa: 'ABC1234',
    cpf_motorista: '12345678901',
    destino_id: 1,
    m3: 1,
    kg: 100,
    qtd_nf: 1,
    cod_777_00: 1000,
  };
  let db: any;
  let manifest: any;
  let entries: any[];
  let service: ManifestsService;
  beforeEach(() => {
    manifest = {
      id: 1,
      unit: 101,
      origem: 'RJ',
      manifestos: '101000001-1',
      frete_veiculo: 100,
      fechamento_id: null,
      num_fechamento: null,
    };
    entries = [
      {
        id: 1,
        manifesto_id: 1,
        unit: 101,
        tipo_despesa: 'Credito',
        valor: 50,
        pago: false,
        fechamento_id: null,
      },
      {
        id: 2,
        manifesto_id: 1,
        unit: 101,
        tipo_despesa: 'Debito',
        valor: 25,
        pago: false,
        fechamento_id: null,
      },
      {
        id: 3,
        manifesto_id: 1,
        unit: 101,
        tipo_despesa: 'Adiantamento',
        valor: 10,
        pago: false,
        fechamento_id: null,
      },
    ];
    db = {
      frete_carregamento_manifestos: {
        findFirst: jest.fn(async ({ where }) => {
          if (where.manifestos) return null;
          return manifest &&
            where.id === manifest.id &&
            where.unit === manifest.unit
            ? manifest
            : null;
        }),
        update: jest.fn(
          async ({ data }) => (manifest = { ...manifest, ...data }),
        ),
        delete: jest.fn(async () => {
          const previous = manifest;
          manifest = null;
          return previous;
        }),
      },
      frete_lancamentos: {
        findMany: jest.fn(async () => entries),
        updateMany: jest.fn(async ({ data }) => {
          entries = entries.map((entry) => ({ ...entry, ...data }));
          return { count: entries.length };
        }),
        deleteMany: jest.fn(async () => {
          const count = entries.length;
          entries = [];
          return { count };
        }),
      },
      vehicle: {
        findUnique: jest.fn(async () => ({
          codVehicleType: 1,
          canceled: false,
        })),
      },
      vehicleType: {
        findUnique: jest.fn(async () => ({
          typeName: 'VAN',
          freight_value: 999,
        })),
      },
      driver: { findUnique: jest.fn(async () => ({ name: 'Novo motorista' })) },
      frete_destinos: {
        findFirst: jest.fn(async () => ({ nome: 'Novo destino' })),
      },
      frete_regras_calculo: {
        findMany: jest.fn(async () => [
          { codigo_frete: 777, aliquota: '0.07', percentual: '0.15' },
          { codigo_frete: 888, aliquota: '0.12', percentual: '0.25' },
          { codigo_frete: 999, aliquota: '0.12', percentual: '1' },
        ]),
      },
    };
    db.frete_semanas = {
      findMany: jest.fn(async () => [
        {
          codigo: '2639',
          data_inicio: new Date('2026-09-21T00:00:00Z'),
          data_fim: new Date('2026-09-27T00:00:00Z'),
        },
      ]),
    };
    db.frete_fechamentos = { findFirst: jest.fn(async () => null) };
    db.$transaction = jest.fn(async (action) => {
      const oldManifest = { ...manifest };
      const oldEntries = entries.map((entry) => ({ ...entry }));
      try {
        return await action(db);
      } catch (error) {
        manifest = oldManifest;
        entries = oldEntries;
        throw error;
      }
    });
    service = new ManifestsService(db, new FreightCalculationService(db));
  });

  it('preserva origem/frete manual, inclui créditos e sincroniza os dados vinculados', async () => {
    const result = await service.update(
      1,
      { ...dto, ctrb_total: 200, ctrb_adiantamento: 20, irrf: 5 },
      user,
    );
    expect(result).toMatchObject({
      id: 1,
      origem: 'RJ',
      frete_veiculo: 100,
      frt_tl_vlc: 150,
      percentual_antigo: 1,
      valor_liquido: 175,
    });
    expect(result.perc_final).toBeCloseTo(150 / 930, 8);
    expect(entries[0]).toMatchObject({
      manifesto_id: 1,
      valor: 50,
      placa: 'ABC1234',
      motorista: 'Novo motorista',
      destino: 'NOVO DESTINO',
    });
    expect(db.frete_carregamento_manifestos.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          unit: 101,
          id: { not: 1 },
          OR: [
            { manifestos: { in: [dto.manifestos] } },
            { manifesto_adicional_1: { in: [dto.manifestos] } },
            { manifesto_adicional_2: { in: [dto.manifestos] } },
            { manifesto_adicional_3: { in: [dto.manifestos] } },
          ],
        }),
      }),
    );
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('permite alterar explicitamente origem e frete do veículo', async () => {
    const result = await service.update(
      1,
      { ...dto, origem: 'SP', frete_veiculo: 200 },
      user,
    );
    expect(result).toMatchObject({
      origem: 'SP',
      frete_veiculo: 200,
      frt_tl_vlc: 250,
    });
  });

  it('não soma débitos nem adiantamentos ao custo', async () => {
    entries = entries.slice(1);
    expect((await service.update(1, dto, user)).frt_tl_vlc).toBe(100);
  });

  it('exclui os lançamentos abertos antes de excluir o manifesto', async () => {
    expect(await service.remove(1, user)).toEqual({
      id: 1,
      deleted: true,
      deletedEntries: 3,
    });
    expect(entries).toHaveLength(0);
    expect(manifest).toBeNull();
    expect(
      db.frete_lancamentos.deleteMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      db.frete_carregamento_manifestos.delete.mock.invocationCallOrder[0],
    );
  });

  it.each(['fechamento_id'])(
    'bloqueia edição e exclusão com %s',
    async (field) => {
      manifest[field] = 1;
      await expect(service.update(1, dto, user)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.remove(1, user)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(db.frete_lancamentos.deleteMany).not.toHaveBeenCalled();
    },
  );

  it('permite editar e excluir manifesto numerado mas ainda aberto', async () => {
    manifest.num_fechamento = 26390001;
    await expect(service.update(1, dto, user)).resolves.toMatchObject({
      num_fechamento: 26390001,
    });
    await expect(service.remove(1, user)).resolves.toMatchObject({
      deleted: true,
    });
  });

  it.each(['pago', 'fechamento_id', 'unit'])(
    'bloqueia quando lançamento possui %s incompatível',
    async (field) => {
      entries[0][field] = field === 'pago' ? true : 202;
      await expect(service.update(1, dto, user)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.remove(1, user)).rejects.toBeInstanceOf(
        ConflictException,
      );
    },
  );

  it('não altera nem exclui manifesto de outra unidade', async () => {
    await expect(
      service.update(1, dto, { ...user, unit: 202 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove(1, { ...user, unit: 202 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.frete_lancamentos.findMany).not.toHaveBeenCalled();
  });

  it('rejeita número duplicado sem alterar dados', async () => {
    db.frete_carregamento_manifestos.findFirst
      .mockResolvedValueOnce(manifest)
      .mockResolvedValueOnce({ id: 2 });
    await expect(service.update(1, dto, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.frete_carregamento_manifestos.update).not.toHaveBeenCalled();
  });

  it('aborta a edição se a sincronização dos lançamentos falhar', async () => {
    db.frete_lancamentos.updateMany.mockRejectedValue({ code: 'P2003' });
    await expect(service.update(1, dto, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(manifest.manifestos).toBe('101000001-1');
  });

  it('aborta a exclusão dos lançamentos se outro vínculo impedir excluir o manifesto', async () => {
    db.frete_carregamento_manifestos.delete.mockRejectedValue({
      code: 'P2003',
    });
    await expect(service.remove(1, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(entries).toHaveLength(3);
    expect(manifest.id).toBe(1);
  });

  it('repete conflito de serialização e limita as tentativas', async () => {
    db.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    await service.update(1, dto, user);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    db.$transaction.mockClear().mockRejectedValue({ code: 'P2034' });
    await expect(service.remove(1, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });

  it.each([
    { semana: '2026-02-30' },
    { semana: '2026-09-22T00:00:00Z' },
    { hora: '25:00' },
    { manifestos: '   ' },
  ])('rejeita dados inválidos: %j', async (invalid) => {
    expect(
      (
        await validate(
          plainToInstance(CreateManifestDto, { ...dto, ...invalid }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
