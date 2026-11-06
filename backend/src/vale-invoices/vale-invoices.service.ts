import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import type { Prisma } from '../generated/prisma/client';
import type { AuthUser } from '../auth/auth-user.types';
import { PrismaService } from '../prisma/prisma.service';
import type { TableReport } from '../reports/report-render';
import { CreateValeInvoiceDto, PreviewValeInvoiceDto } from './vale-invoices.dto';

const displayDate = (value: Date) =>
  value.toISOString().slice(0, 10).split('-').reverse().join('/');
const money = (value: Decimal.Value) => new Decimal(value).toFixed(2);

@Injectable()
export class ValeInvoicesService {
  constructor(private readonly db: PrismaService) {}

  private period(dto: CreateValeInvoiceDto) {
    const start = new Date(`${dto.inicio}T00:00:00.000Z`);
    const end = new Date(`${dto.fim}T00:00:00.000Z`);
    if (start > end)
      throw new BadRequestException('A data inicial deve ser anterior à final.');
    return { start, end };
  }

  private async availableEntries(
    database: Pick<PrismaService, 'frete_lancamentos'>,
    start: Date,
    end: Date,
    extraWhere: Prisma.frete_lancamentosWhereInput = {},
  ) {
    return database.frete_lancamentos.findMany({
      where: {
        cancelado: false,
        data_lancamento: { gte: start, lte: end },
        fatura_id: null,
        numero_fatura: null,
        ...extraWhere,
      },
      orderBy: [{ data_lancamento: 'asc' }, { id: 'asc' }],
    });
  }

  async preview(dto: PreviewValeInvoiceDto, user: AuthUser) {
    const { start, end } = this.period(dto);
    const branches = dto.local || dto.dominio
      ? await this.db.branches.findMany({
          where: {
            ...(dto.local ? { branch: dto.local } : {}),
            ...(dto.dominio ? { dominio: dto.dominio } : {}),
          },
          select: { unit: true },
        })
      : [];
    const typeWhere: Prisma.frete_lancamentosWhereInput =
      dto.movimento === 'credito'
        ? { tipo_despesa: 'Credito' }
        : dto.movimento === 'ctrb'
          ? { OR: [{ tipo_despesa: 'Adiantamento' }, { codigo_despesa: '3333' }] }
          : dto.movimento === 'debito'
            ? { tipo_despesa: 'Debito', codigo_despesa: { not: '3333' } }
            : {};
    const entries = await this.availableEntries(this.db, start, end, {
      ...typeWhere,
      ...(dto.local || dto.dominio
        ? { unit: { in: branches.map((branch) => branch.unit) } }
        : {}),
    });
    const total = entries.reduce(
      (sum, entry) => sum.plus(entry.valor),
      new Decimal(0),
    );
    return {
      unit: 0,
      periodo_inicio: start,
      periodo_fim: end,
      quantidade: entries.length,
      valor_total: total,
      lancamentos: entries,
    };
  }

  async create(dto: CreateValeInvoiceDto, user: AuthUser) {
    const { start, end } = this.period(dto);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.db.$transaction(
          async (tx) => {
            const entries = await this.availableEntries(tx, start, end);
            if (!entries.length)
              throw new BadRequestException(
                'Não existem vales sem fechamento de vale no período informado.',
              );
            const last = await tx.frete_faturas_vales.findFirst({
              orderBy: { numero: 'desc' },
              select: { numero: true },
            });
            const numero = (last?.numero ?? 0) + 1;
            const total = entries.reduce(
              (sum, entry) => sum.plus(entry.valor),
              new Decimal(0),
            );
            const invoice = await tx.frete_faturas_vales.create({
              data: {
                numero,
                unit: 0,
                periodo_inicio: start,
                periodo_fim: end,
                quantidade: entries.length,
                valor_total: total,
                responsavel_cod: user.cod,
                alterado_por: user.cod,
              },
            });
            const changed = await tx.frete_lancamentos.updateMany({
              where: {
                id: { in: entries.map((entry) => entry.id) },
                cancelado: false,
                fatura_id: null,
                numero_fatura: null,
              },
              data: { fatura_id: invoice.id, numero_fatura: numero, alterado_por: user.cod },
            });
            if (changed.count !== entries.length)
              throw new ConflictException(
                'Um dos vales foi incluído em outro fechamento de vale simultaneamente. Tente novamente.',
              );
            return { ...invoice, entries };
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2034' &&
            (error as { code?: string }).code !== 'P2002') throw error;
        if (attempt === 2)
          throw new ConflictException('Conflito ao gerar o fechamento de vale. Tente novamente.');
      }
    }
  }

  async previewReports(dto: PreviewValeInvoiceDto, user: AuthUser, separated = false) {
    const preview = await this.preview(dto, user);
    const invoice = {
      ...preview,
      id: 0,
      numero: 0,
      responsavel_cod: user.cod,
      status: 'PREVIA',
      created_at: new Date(),
    } as Awaited<ReturnType<ValeInvoicesService['findOne']>>;
    if (!separated)
      return [this.tableReport(invoice, preview.lancamentos, undefined, 'Consulta de vales para fechamento')];
    return [
      { type: 'Debito', title: 'Débitos' },
      { type: 'Credito', title: 'Créditos' },
      { type: 'Adiantamento', title: 'CTRB' },
    ].map(({ type, title }) =>
      this.tableReport(
        invoice,
        preview.lancamentos.filter((entry) =>
          title === 'CTRB'
            ? entry.tipo_despesa === type || entry.codigo_despesa.trim() === '3333'
            : entry.tipo_despesa === type && entry.codigo_despesa.trim() !== '3333',
        ),
        title,
        'Consulta de vales para fechamento',
      ),
    );
  }

  list(user: AuthUser, numero?: string) {
    const searched = numero?.trim();
    return this.db.frete_faturas_vales.findMany({
      where: {
        status: { not: 'CANCELADA' },
        ...(searched && /^\d+$/.test(searched) ? { numero: Number(searched) } : {}),
      },
      orderBy: { numero: 'desc' },
      take: searched ? 10 : 100,
    });
  }

  async findOne(id: number, user: AuthUser) {
    const invoice = await this.db.frete_faturas_vales.findFirst({
      where: { id, status: { not: 'CANCELADA' } },
      include: {
        lancamentos: {
          where: { cancelado: false },
          orderBy: [{ data_lancamento: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!invoice) throw new NotFoundException('Fechamento de vale não encontrado.');
    return invoice;
  }

  async remove(id: number, user: AuthUser) {
    if (!user.isAdmin && !user.deletionApprovedBy)
      throw new NotFoundException('Fechamento de vale não encontrado.');
    return this.db.$transaction(async (tx) => {
      const invoice = await tx.frete_faturas_vales.findFirst({
        where: { id, status: { not: 'CANCELADA' } },
      });
      if (!invoice)
        throw new NotFoundException('Fechamento de vale não encontrado.');
      const released = await tx.frete_lancamentos.updateMany({
        where: { fatura_id: id, numero_fatura: invoice.numero },
        data: { fatura_id: null, numero_fatura: null, alterado_por: user.cod },
      });
      await tx.frete_faturas_vales.update({
        where: { id },
        data: { status: 'CANCELADA', alterado_por: user.cod },
      });
      return { numero: invoice.numero, released: released.count };
    });
  }

  async report(id: number, user: AuthUser): Promise<TableReport> {
    const invoice = await this.findOne(id, user);
    return this.tableReport(invoice, invoice.lancamentos);
  }

  async separatedReports(id: number, user: AuthUser): Promise<TableReport[]> {
    const invoice = await this.findOne(id, user);
    const groups = [
      { type: 'Debito', title: 'Débitos' },
      { type: 'Credito', title: 'Créditos' },
      { type: 'Adiantamento', title: 'CTRB' },
    ];
    return groups.map(({ type, title }) => {
      const entries = invoice.lancamentos.filter(
        (entry) => entry.tipo_despesa === type,
      );
      return this.tableReport(invoice, entries, title);
    });
  }

  private tableReport(
    invoice: Awaited<ReturnType<ValeInvoicesService['findOne']>>,
    entries: typeof invoice.lancamentos,
    section?: string,
    titleOverride?: string,
  ): TableReport {
    const total = entries.reduce(
      (sum, entry) => sum.plus(entry.valor),
      new Decimal(0),
    );
    const typeTotal = (type: string) => entries
      .filter((entry) => entry.tipo_despesa === type)
      .reduce((sum, entry) => sum.plus(entry.valor), new Decimal(0));
    return {
      title: `${titleOverride ?? `Fechamento de vale nº ${String(invoice.numero).padStart(6, '0')}`}${section ? ` — ${section}` : ''}`,
      notes: [
        `${displayDate(invoice.periodo_inicio)} a ${displayDate(invoice.periodo_fim)}`,
        `Gerada por ${invoice.responsavel_cod} em ${displayDate(invoice.created_at)}`,
      ],
      columns: ['Data', 'ID Vale', 'Placa', 'Manifesto', 'Despesa', 'Descrição', 'Usuário', 'D/C', 'Valor'],
      rows: entries.map((entry) => [
        displayDate(entry.data_lancamento),
        entry.controle_id ?? entry.id,
        entry.placa,
        entry.manifesto_numero,
        `${entry.codigo_despesa} - ${String(entry.codigo_despesa).trim() === '3333' ? 'CTRB' : entry.nome_despesa}`,
        entry.descricao,
        entry.responsavel_cod,
        String(entry.codigo_despesa).trim() === '3333' ? 'CTRB' : entry.tipo_despesa,
        money(entry.valor),
      ]),
      numeric: [8],
      totals: section
        ? [{ label: `Total de ${section.toLowerCase()}`, value: money(total) }]
        : [
            { label: 'Total de créditos', value: money(typeTotal('Credito')) },
            { label: 'Total de débitos', value: money(typeTotal('Debito')) },
            { label: 'Total de CTRB', value: money(typeTotal('Adiantamento')) },
            { label: 'Total do fechamento de vale', value: money(invoice.valor_total) },
          ],
    };
  }
}
