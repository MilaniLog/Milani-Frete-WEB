import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FreightCalculationService } from '../freight-calculation/freight-calculation.service';
import { FreightEntriesService } from './freight-entries.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EntryDto } from './dto/entry.dto';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

describe('Lançamentos vinculados ao manifesto', () => {
  it.each([undefined, 1])('bloqueia manutenção de despesas por usuário comum (id=%s)', async id => {
    const transaction = jest.fn();
    const restricted = new FreightEntriesService({$transaction:transaction} as any, {} as any);
    await expect(restricted.saveExpense({codigo:'0003',nome:'Teste',tipo:'Debito',ativo:false},
      {sub:1,cod:1,unit:100,isAdmin:false}, id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });
  const user = { sub: 1, cod: 10, unit: 101, isAdmin: false };
  const dto = { despesa_id: 1, data_lancamento: '2026-09-22', valor: 50 };
  let manifest: any;
  let entries: any[];
  let db: any;
  let service: FreightEntriesService;
  const matches = (item: any, where: any) =>
    Object.entries(where).every(([key, value]) => item[key] === value);

  beforeEach(() => {
    manifest = {
      id: 1,
      unit: 101,
      origem: 'RJ',
      placa: 'ABC1234',
      motorista: 'Teste',
      tipo_veiculo: 'VAN',
      destino: 'Teste',
      fechamento_id: null,
      num_fechamento: null,
      frete_veiculo: 100,
      cod_777_00: 1000,
      cod_888_00: 0,
      cod_999_00: 0,
      nao_777: 0,
      nao_888: 0,
      nao_999: 0,
      outros: 0,
      diaria: 0,
      tde: 0,
      escada: 0,
      paletização: 0,
      estadia: 0,
      descarga: 0,
      ctrb_total: 200,
      valor_liquido: 180,
    };
    entries = [];
    const expenses = [
      {
        id: 1,
        unit: 101,
        codigo: '01',
        nome: 'Crédito',
        tipo: 'Credito',
        ativo: true,
      },
      {
        id: 2,
        unit: 101,
        codigo: '02',
        nome: 'Débito',
        tipo: 'Debito',
        ativo: true,
      },
      {
        id: 3,
        unit: 101,
        codigo: '03',
        nome: 'Adiantamento',
        tipo: 'Adiantamento',
        ativo: true,
      },
      {
        id: 4,
        unit: 202,
        codigo: '04',
        nome: 'Outra unidade',
        tipo: 'Credito',
        ativo: true,
      },
      {
        id: 5,
        unit: 101,
        codigo: '05',
        nome: 'Inativa',
        tipo: 'Credito',
        ativo: false,
      },
    ];
    db = {
      frete_carregamento_manifestos: {
        findFirst: jest.fn(async ({ where }) =>
          matches(manifest, where) ? manifest : null,
        ),
        update: jest.fn(async ({ data }) => {
          manifest = { ...manifest, ...data };
          return manifest;
        }),
      },
      frete_despesas: {
        findFirst: jest.fn(
          async ({ where }) =>
            expenses.find((expense) => matches(expense, where)) ?? null,
        ),
      },
      frete_regras_calculo: {
        findMany: jest.fn(async () => [
          { codigo_frete: 777, aliquota: '0.07', percentual: '0.15' },
          { codigo_frete: 888, aliquota: '0.12', percentual: '0.25' },
          { codigo_frete: 999, aliquota: '0.12', percentual: '1' },
        ]),
      },
      frete_lancamentos: {
        findMany: jest.fn(async ({ where }) =>
          entries.filter((entry) => matches(entry, where)),
        ),
        findFirst: jest.fn(
          async ({ where }) =>
            entries.find((entry) => matches(entry, where)) ?? null,
        ),
        aggregate: jest.fn(async () => ({ _max: { numero: 9 } })),
        create: jest.fn(async ({ data }) => {
          const entry = {
            id: entries.length + 1,
            pago: false,
            fechamento_id: null,
            ...data,
          };
          entries.push(entry);
          return entry;
        }),
        update: jest.fn(async ({ where, data }) => {
          const entry = entries.find((item) => matches(item, where));
          Object.assign(entry, data);
          return entry;
        }),
        delete: jest.fn(async ({ where }) => {
          const index = entries.findIndex((item) => matches(item, where));
          return entries.splice(index, 1)[0];
        }),
      },
    };
    // Simulação da atomicidade: testes de integração com MySQL ficam separados.
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
      const oldEntries = entries.map((entry) => ({ ...entry }));
      const oldManifest = { ...manifest };
      try {
        return await action(db);
      } catch (error) {
        entries = oldEntries;
        manifest = oldManifest;
        throw error;
      }
    });
    service = new FreightEntriesService(db, new FreightCalculationService(db));
  });

  it('inclui crédito, numera por unidade e recalcula ambos os modos com a origem salva', async () => {
    const result = await service.changeEntry(1, user, { kind: 'create', dto });
    expect(result.entry).toMatchObject({
      numero: 10,
      unit: 101,
      manifesto_id: 1,
      tipo_despesa: 'Credito',
      responsavel_cod: 10,
    });
    expect(result.manifesto).toMatchObject({
      frt_tl_vlc: 150,
      sub_frete: 150,
      percentual_antigo: 1,
      valor_liquido: 180,
    });
    expect(result.manifesto.perc_final).toBeCloseTo(150 / 930, 8);
    expect(db.frete_regras_calculo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ origem: 'RJ' }),
      }),
    );
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it.each([2, 3])(
    'registra tipo %s sem aumentar o custo do veículo ou reduzir o CTRB',
    async (despesa_id) => {
      const result = await service.changeEntry(1, user, {
        kind: 'create',
        dto: { ...dto, despesa_id },
      });
      expect(result.manifesto).toMatchObject({
        frt_tl_vlc: 100,
        valor_liquido: 180,
      });
    },
  );

  it('edita e exclui o crédito recalculando os totais', async () => {
    await service.changeEntry(1, user, { kind: 'create', dto });
    const edited = await service.changeEntry(1, user, {
      kind: 'update',
      id: 1,
      dto: { ...dto, valor: 75 },
    });
    expect(edited.manifesto.frt_tl_vlc).toBe(175);
    const deleted = await service.changeEntry(1, user, {
      kind: 'delete',
      id: 1,
    });
    expect(deleted.manifesto.frt_tl_vlc).toBe(100);
    expect(entries).toHaveLength(0);
  });

  it.each([5])(
    'recusa despesa inativa: %s',
    async (despesa_id) => {
      await expect(
        service.changeEntry(1, user, {
          kind: 'create',
          dto: { ...dto, despesa_id },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(db.frete_lancamentos.create).not.toHaveBeenCalled();
    },
  );



  it('aceita despesa global mesmo cadastrada em outra unidade', async () => {
    const created = await service.changeEntry(1, user, {
      kind: 'create',
      dto: { ...dto, despesa_id: 4 },
    });
    expect(created.entry.codigo_despesa).toBe('04');
    expect(created.entry.unit).toBe(101);
  });

  it('recusa manifesto de outra unidade na escrita e na leitura', async () => {
    const other = { ...user, unit: 202 };
    await expect(
      service.changeEntry(1, other, { kind: 'create', dto }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listEntries(1, other)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each(['fechamento_id'])(
    'bloqueia manifesto com %s',
    async (field) => {
      manifest[field] = 10;
      await expect(
        service.changeEntry(1, user, { kind: 'create', dto }),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('permite lancamento em manifesto numerado mas ainda aberto', async () => {
    manifest.num_fechamento = 26390001;
    await expect(
      service.changeEntry(1, user, { kind: 'create', dto }),
    ).resolves.toMatchObject({
      entry: { manifesto_id: 1 },
    });
  });

  it.each(['pago', 'fechamento_id'])(
    'bloqueia edição e exclusão de lançamento com %s',
    async (field) => {
      await service.changeEntry(1, user, { kind: 'create', dto });
      entries[0][field] = field === 'pago' ? true : 10;
      await expect(
        service.changeEntry(1, user, { kind: 'update', id: 1, dto }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.changeEntry(1, user, { kind: 'delete', id: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('não altera lançamento vinculado a outro manifesto', async () => {
    entries.push({ id: 10, unit: 101, manifesto_id: 2 });
    await expect(
      service.changeEntry(1, user, { kind: 'delete', id: 10 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('propaga erro de cálculo para abortar a transação', async () => {
    manifest.nao_777 = 1000;
    await expect(
      service.changeEntry(1, user, { kind: 'create', dto }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(entries).toHaveLength(0);
    expect(db.frete_carregamento_manifestos.update).not.toHaveBeenCalled();
  });

  it('repete a transação após conflito de serialização', async () => {
    db.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    await service.changeEntry(1, user, { kind: 'create', dto });
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(entries).toHaveLength(1);
  });

  it('limita tentativas quando persiste conflito de numeração', async () => {
    db.$transaction.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.changeEntry(1, user, { kind: 'create', dto }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });

  it.each([
    { valor: -1 },
    { valor: 1.001 },
    { data_lancamento: '2026-02-30' },
    { data_lancamento: '2026-09-22T10:00:00Z' },
  ])('valida valores e datas na entrada: %j', async (invalid) => {
    const errors = await validate(
      plainToInstance(EntryDto, { ...dto, ...invalid }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
