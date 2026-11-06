import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ValeInvoicesService } from './vale-invoices.service';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

describe('Faturas de vales', () => {
  const user = { sub: 1, cod: 7, unit: 100, isAdmin: false } as any;
  let db: any;
  let service: ValeInvoicesService;
  let entries: any[];
  let invoices: any[];

  beforeEach(() => {
    entries = [
      {
        id: 10,
        unit: 100,
        data_lancamento: new Date('2026-10-20T00:00:00Z'),
        valor: '25.50',
        fatura_id: null,
        numero_fatura: null,
        placa: 'ABC1234',
        manifesto_numero: '000001-1',
        codigo_despesa: '0001',
        nome_despesa: 'MOEDA',
        descricao: 'Teste',
        tipo_despesa: 'Debito',
        responsavel_cod: 41,
      },
      {
        id: 11,
        unit: 100,
        data_lancamento: new Date('2026-10-21T00:00:00Z'),
        valor: '4.50',
        fatura_id: null,
        numero_fatura: null,
        placa: 'DEF5678',
        manifesto_numero: null,
        codigo_despesa: '0060',
        nome_despesa: 'CRÉDITO',
        descricao: null,
        tipo_despesa: 'Credito',
        responsavel_cod: 42,
      },
    ];
    invoices = [];
    db = {
      branches: {
        findUnique: jest.fn(async ({ where }) => where.unit === 100 ? { unit: 100 } : null),
        findMany: jest.fn(async () => [{ unit: 100 }]),
      },
      frete_lancamentos: {
        findMany: jest.fn(async () => entries.filter((entry) => entry.fatura_id == null)),
        updateMany: jest.fn(async ({ where, data }) => {
          const selected = entries.filter((entry) =>
            where.id?.in
              ? where.id.in.includes(entry.id) && entry.fatura_id == null
              : entry.fatura_id === where.fatura_id && entry.numero_fatura === where.numero_fatura,
          );
          selected.forEach((entry) => Object.assign(entry, data));
          return { count: selected.length };
        }),
      },
      frete_faturas_vales: {
        findFirst: jest.fn(async (args) => {
          if (args?.orderBy) return invoices.at(-1) ?? null;
          if (args?.where?.id)
            return invoices.find((invoice) => invoice.id === args.where.id && invoice.status !== 'CANCELADA') ?? null;
          return null;
        }),
        findMany: jest.fn(async () => invoices),
        create: jest.fn(async ({ data }) => {
          const row = { id: invoices.length + 1, created_at: new Date(), status: 'FECHADA', ...data };
          invoices.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }) => {
          const row = invoices.find((invoice) => invoice.id === where.id);
          Object.assign(row, data);
          return row;
        }),
      },
    };
    db.$transaction = jest.fn((work) => work(db));
    service = new ValeInvoicesService(db);
  });

  it('gera número global e grava o número em todos os vales do período', async () => {
    const result = await service.create(
      { inicio: '2026-10-20', fim: '2026-10-21' },
      user,
    );
    expect(result).toMatchObject({ numero: 1, quantidade: 2 });
    expect(String(result.valor_total)).toBe('30');
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fatura_id: 1, numero_fatura: 1 }),
      ]),
    );
  });

  it('consulta os vales disponíveis sem gerar fechamento', async () => {
    const result = await service.preview(
      { inicio: '2026-10-20', fim: '2026-10-21' },
      user,
    );

    expect(result).toMatchObject({ unit: 0, quantidade: 2 });
    expect(String(result.valor_total)).toBe('30');
    expect(result.lancamentos.map((entry) => entry.id)).toEqual([10, 11]);
    expect(db.frete_faturas_vales.create).not.toHaveBeenCalled();
    expect(db.frete_lancamentos.updateMany).not.toHaveBeenCalled();
  });

  it('filtra somente a consulta por tipo, unidade e domínio', async () => {
    await service.preview(
      {
        inicio: '2026-10-20',
        fim: '2026-10-21',
        movimento: 'debito',
        local: 'SP',
        dominio: 'LOOG',
      },
      user,
    );

    expect(db.branches.findMany).toHaveBeenCalledWith({
      where: { branch: 'SP', dominio: 'LOOG' },
      select: { unit: true },
    });
    expect(db.frete_lancamentos.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tipo_despesa: 'Debito',
          codigo_despesa: { not: '3333' },
          unit: { in: [100] },
        }),
      }),
    );
  });

  it('gera impressão da consulta sem criar fechamento', async () => {
    const reports = await service.previewReports(
      { inicio: '2026-10-20', fim: '2026-10-21' },
      user,
      true,
    );

    expect(reports.map((report) => report.title)).toEqual([
      'Consulta de vales para fechamento — Débitos',
      'Consulta de vales para fechamento — Créditos',
      'Consulta de vales para fechamento — CTRB',
    ]);
    expect(db.frete_faturas_vales.create).not.toHaveBeenCalled();
    expect(db.frete_lancamentos.updateMany).not.toHaveBeenCalled();
  });

  it('não reutiliza vales já faturados', async () => {
    entries.forEach((entry) => Object.assign(entry, { fatura_id: 3, numero_fatura: 3 }));
    await expect(
      service.create({ inicio: '2026-10-20', fim: '2026-10-21' }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('inclui vales de todas as unidades no mesmo fechamento', async () => {
    entries.push({ ...entries[0], id: 12, unit: 800, valor: '10.00' });
    const result = await service.create(
      { inicio: '2026-10-20', fim: '2026-10-21' },
      user,
    );
    expect(result).toMatchObject({ unit: 0, quantidade: 3 });
    expect(entries.find((entry) => entry.id === 12)).toMatchObject({ numero_fatura: 1 });
  });

  it('separa débito, crédito e adiantamento em relatórios distintos', async () => {
    entries.push({
      ...entries[0],
      id: 12,
      tipo_despesa: 'Adiantamento',
      valor: '10.00',
    });
    await service.create(
      { inicio: '2026-10-20', fim: '2026-10-21' },
      user,
    );
    db.frete_faturas_vales.findFirst.mockResolvedValue({
      ...invoices[0],
      lancamentos: entries,
    });

    const reports = await service.separatedReports(1, user);

    expect(reports.map((report) => report.title)).toEqual([
      expect.stringContaining('Débitos'),
      expect.stringContaining('Créditos'),
      expect.stringContaining('CTRB'),
    ]);
    expect(reports.map((report) => report.rows.length)).toEqual([1, 1, 1]);
  });

  it('mostra no relatório o usuário que lançou cada vale', async () => {
    await service.create(
      { inicio: '2026-10-20', fim: '2026-10-21' },
      user,
    );
    db.frete_faturas_vales.findFirst.mockResolvedValue({
      ...invoices[0],
      lancamentos: entries,
    });

    const report = await service.report(1, user);

    expect(report.columns).toContain('Usuário');
    expect(report.rows.map((row) => row[6])).toEqual([41, 42]);
  });

  it('cancela o relatório, libera os vales e não apaga o número', async () => {
    await service.create(
      { inicio: '2026-10-20', fim: '2026-10-21' },
      user,
    );

    const result = await service.remove(1, { ...user, isAdmin: true });

    expect(result).toEqual({ numero: 1, released: 2 });
    expect(entries.every((entry) => entry.fatura_id == null && entry.numero_fatura == null)).toBe(true);
    expect(invoices[0]).toMatchObject({ numero: 1, status: 'CANCELADA' });
  });
});
