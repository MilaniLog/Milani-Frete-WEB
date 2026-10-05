import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user.types';
import { getWeek } from '../weeks/period-policy';
import { CancelClosureDto, ClosureDto } from './freight-closures.dto';
import { allocatePayment } from './payment-allocation';

@Injectable()
export class FreightClosuresService {
  constructor(private readonly prisma: PrismaService) {}

  // Dates and Decimal amounts are stored as strings, preserving their precision.
  private snapshot(value: unknown): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify(value));
  }

  private async transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    timeout?: number,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: 'Serializable',
          ...(timeout ? { timeout } : {}),
        });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2034') throw error;
        if (attempt >= 2)
          throw new ConflictException(
            'Fechamento alterado simultaneamente. Tente novamente.',
          );
      }
    }
  }

  private async collect(
    tx: Prisma.TransactionClient,
    dto: ClosureDto,
    user: AuthUser,
  ) {
    const week = await getWeek(tx, dto.semana);
    const dates = { gte: week.data_inicio, lte: week.data_fim };
    const manifests = await tx.frete_carregamento_manifestos.findMany({
      where: {
        unit: user.unit,
        placa: dto.placa,
        semana: dates,
        fechamento_id: null,
        num_fechamento: null,
      },
      orderBy: { id: 'asc' },
    });
    const ids = manifests.map((row) => row.id);
    // Linked expenses follow their manifest, including expenses dated outside the week.
    const entries = await tx.frete_lancamentos.findMany({
      where: {
        OR: [
          { manifesto_id: { in: ids } },
          {
            unit: user.unit,
            placa: dto.placa,
            manifesto_id: null,
            data_lancamento: dates,
            pago: false,
            fechamento_id: null,
            tipo_despesa: { in: ['Credito', 'Debito'] },
          },
        ],
      },
      orderBy: { id: 'asc' },
    });
    if (
      entries.some(
        (row) =>
          row.unit !== user.unit ||
          row.placa !== dto.placa ||
          row.pago ||
          row.fechamento_id !== null,
      )
    )
      throw new ConflictException(
        'Manifesto possui lançamento incompatível ou já fechado.',
      );
    if (
      entries.some(
        (row) =>
          !['Credito', 'Debito', 'Adiantamento'].includes(row.tipo_despesa),
      )
    )
      throw new ConflictException('Tipo de lançamento desconhecido.');
    const coupons = await tx.frete_cupons.findMany({
      where: {
        unit: user.unit,
        placa: dto.placa,
        data_cobranca: dates,
        pago: false,
        fechamento_id: null,
      },
      orderBy: { id: 'asc' },
    });
    const sum = (values: Decimal[]) =>
      values.reduce((total, value) => total.plus(value), new Decimal(0));
    const freight = sum(manifests.map((row) => row.frete_veiculo));
    const credits = sum(
      entries
        .filter((row) => row.tipo_despesa === 'Credito')
        .map((row) => row.valor),
    );
    const debits = sum(
      entries
        .filter((row) => row.tipo_despesa === 'Debito')
        .map((row) => row.valor),
    );
    const couponValue = sum(coupons.map((row) => row.valor));
    const gross = freight.plus(credits);
    const money = (value: Decimal) =>
      value.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    const vehicle = await tx.vehicle.findUnique({
      where: { plate: dto.placa },
      select: {
        empresa_sigla: true,
        first_payer: true,
        owner: true,
        owner_name: true,
      },
    });
    if (!vehicle)
      throw new NotFoundException('Veículo não encontrado para o rateio.');
    const payment = allocatePayment(
      money(gross.minus(debits).minus(couponValue)),
      {
        ...vehicle,
        first_payer: vehicle.empresa_sigla ?? vehicle.first_payer,
        second_payer: null,
        second_payer_percent: new Decimal(0),
      },
      manifests.map((row) => row.ctrb_numero),
    );
    return {
      payment,
      beneficiario: {
        documento: vehicle.owner ?? null,
        nome: vehicle.owner_name ?? null,
      },
      semana: week.codigo,
      placa: dto.placa,
      periodo_inicio: week.data_inicio,
      periodo_fim: week.data_fim,
      manifests,
      entries,
      coupons,
      totals: {
        fretes: money(freight),
        creditos: money(credits),
        debitos: money(debits),
        cupons: money(couponValue),
        total_bruto: money(gross),
        total_liquido: money(gross.minus(debits).minus(couponValue)),
        // Informational only: CTRB is not deducted again from the settlement.
        total_ctrb: money(sum(manifests.map((row) => row.ctrb_total))),
      },
    };
  }

  preview(dto: ClosureDto, user: AuthUser) {
    return this.transaction((tx) => this.collect(tx, dto, user));
  }

  finalizeWeek(semana: string, user: AuthUser) {
    return this.transaction(async (tx) => {
      const week = await getWeek(tx, semana);
      const dates = { gte: week.data_inicio, lte: week.data_fim };
      const manifests = await tx.frete_carregamento_manifestos.findMany({
        where: {
          unit: user.unit,
          semana: dates,
          fechamento_id: null,
          num_fechamento: null,
        },
        select: { placa: true },
      });
      const entries = await tx.frete_lancamentos.findMany({
        where: {
          unit: user.unit,
          data_lancamento: dates,
          manifesto_id: null,
          pago: false,
          fechamento_id: null,
          tipo_despesa: { in: ['Credito', 'Debito'] },
        },
        select: { placa: true },
      });
      const coupons = await tx.frete_cupons.findMany({
        where: {
          unit: user.unit,
          data_cobranca: dates,
          pago: false,
          fechamento_id: null,
        },
        select: { placa: true },
      });
      const plates = [
        ...new Set(
          [...manifests, ...entries, ...coupons].map((row) => row.placa),
        ),
      ].sort();
      if (!plates.length)
        throw new BadRequestException('Não há registros abertos nesta semana.');
      const results: Awaited<
        ReturnType<FreightClosuresService['finalizeTransaction']>
      >[] = [];
      for (const placa of plates)
        results.push(
          await this.finalizeTransaction(tx, { semana, placa }, user),
        );
      return { semana, results };
    }, 60000);
  }

  finalize(dto: ClosureDto, user: AuthUser) {
    return this.transaction((tx) => this.finalizeTransaction(tx, dto, user));
  }

  private async finalizeTransaction(
    tx: Prisma.TransactionClient,
    dto: ClosureDto,
    user: AuthUser,
  ) {
    const data = await this.collect(tx, dto, user);
    if (!data.manifests.length && !data.entries.length && !data.coupons.length)
      throw new BadRequestException(
        'Não há registros abertos para fechar nesta semana e placa.',
      );
    const last = await tx.frete_fechamentos.aggregate({
      _max: { numero: true },
    });
    const closure = await tx.frete_fechamentos.create({
      data: {
        numero: (last._max.numero ?? 0) + 1,
        unit: user.unit,
        semana: data.semana,
        placa: data.placa,
        periodo_inicio: data.periodo_inicio,
        periodo_fim: data.periodo_fim,
        total_bruto: data.totals.total_bruto,
        total_ctrb: data.totals.total_ctrb,
        total_liquido: data.totals.total_liquido,
        status: 'FECHADO',
        historico: this.snapshot({
          versao: 1,
          finalizacao: {
            em: new Date(),
            usuario: { sub: user.sub, cod: user.cod, unit: user.unit },
            dados: data,
          },
        }),
      },
    });
    const manifests = await tx.frete_carregamento_manifestos.updateMany({
      where: {
        id: { in: data.manifests.map((row) => row.id) },
        unit: user.unit,
        fechamento_id: null,
        num_fechamento: null,
      },
      data: { fechamento_id: closure.id, num_fechamento: closure.numero },
    });
    const entries = await tx.frete_lancamentos.updateMany({
      where: {
        id: { in: data.entries.map((row) => row.id) },
        unit: user.unit,
        pago: false,
        fechamento_id: null,
      },
      data: { fechamento_id: closure.id, pago: true },
    });
    const coupons = await tx.frete_cupons.updateMany({
      where: {
        id: { in: data.coupons.map((row) => row.id) },
        unit: user.unit,
        pago: false,
        fechamento_id: null,
      },
      data: { fechamento_id: closure.id, pago: true },
    });
    if (
      manifests.count !== data.manifests.length ||
      entries.count !== data.entries.length ||
      coupons.count !== data.coupons.length
    )
      throw new ConflictException('Registros alterados durante o fechamento.');
    return { closure, totals: data.totals, payment: data.payment };
  }

  list(user: AuthUser) {
    return this.prisma.frete_fechamentos.findMany({
      where: { unit: user.unit },
      orderBy: { id: 'desc' },
      take: 50,
    });
  }
  async findByNumber(numero: number, user: AuthUser) {
    const closure = await this.prisma.frete_fechamentos.findFirst({
      where: { numero, unit: user.unit },
    });
    if (!closure)
      throw new NotFoundException('Fechamento não encontrado nesta unidade.');
    return this.findOne(closure.id, user);
  }

  cancel(id: number, dto: CancelClosureDto, user: AuthUser) {
    if (!user.isAdmin)
      throw new ForbiddenException(
        'Somente administrador pode cancelar fechamento.',
      );
    const motivo = dto.motivo?.trim();
    if (!motivo || motivo.length > 500)
      throw new BadRequestException(
        'Informe o motivo do cancelamento (até 500 caracteres).',
      );
    return this.transaction(async (tx) => {
      const closure = await tx.frete_fechamentos.findFirst({
        where: { id, unit: user.unit },
      });
      if (!closure) throw new NotFoundException('Fechamento não encontrado.');
      if (closure.status !== 'FECHADO')
        throw new ConflictException(
          'Somente fechamento FECHADO pode ser cancelado.',
        );
      // Read all references so a corrupt cross-unit link aborts instead of being silently ignored.
      const where = { fechamento_id: id };
      const manifests = await tx.frete_carregamento_manifestos.findMany({
        where,
      });
      const entries = await tx.frete_lancamentos.findMany({ where });
      const coupons = await tx.frete_cupons.findMany({ where });
      if (
        [...manifests, ...entries, ...coupons].some(
          (row) => row.unit !== user.unit || row.placa !== closure.placa,
        ) ||
        manifests.some((row) => row.num_fechamento !== closure.numero) ||
        [...entries, ...coupons].some((row) => !row.pago)
      )
        throw new ConflictException(
          'Vínculos do fechamento inconsistentes. Revise antes de cancelar.',
        );
      const previous = closure.historico;
      if (
        previous !== null &&
        (typeof previous !== 'object' || Array.isArray(previous))
      )
        throw new ConflictException('Histórico do fechamento inválido.');
      const historico = this.snapshot({
        ...((previous as object) ?? { versao: 1 }),
        cancelamento: {
          em: new Date(),
          usuario: { sub: user.sub, cod: user.cod, unit: user.unit },
          motivo,
          // For legacy closures this is the first available snapshot, not a reconstructed original.
          dados: {
            closure: { ...closure, historico: undefined },
            manifests,
            entries,
            coupons,
          },
        },
      });
      const changed = await tx.frete_fechamentos.updateMany({
        where: { id, unit: user.unit, status: 'FECHADO' },
        data: { status: 'CANCELADO', historico },
      });
      if (changed.count !== 1)
        throw new ConflictException('Fechamento alterado simultaneamente.');
      const scope = { ...where, unit: user.unit };
      const m = await tx.frete_carregamento_manifestos.updateMany({
        where: scope,
        data: { fechamento_id: null, num_fechamento: null },
      });
      const e = await tx.frete_lancamentos.updateMany({
        where: scope,
        data: { fechamento_id: null, pago: false },
      });
      const c = await tx.frete_cupons.updateMany({
        where: scope,
        data: { fechamento_id: null, pago: false },
      });
      if (
        m.count !== manifests.length ||
        e.count !== entries.length ||
        c.count !== coupons.length
      )
        throw new ConflictException(
          'Registros alterados durante o cancelamento.',
        );
      return {
        closure: { ...closure, status: 'CANCELADO', historico },
        reabertos: { manifests: m.count, entries: e.count, coupons: c.count },
      };
    });
  }

  findOne(id: number, user: AuthUser) {
    return this.transaction(async (tx) => {
      const closure = await tx.frete_fechamentos.findFirst({
        where: { id, unit: user.unit },
      });
      if (!closure) throw new NotFoundException('Fechamento não encontrado.');
      const where = { unit: user.unit, fechamento_id: id };
      return {
        closure,
        manifests: await tx.frete_carregamento_manifestos.findMany({ where }),
        entries: await tx.frete_lancamentos.findMany({ where }),
        coupons: await tx.frete_cupons.findMany({ where }),
      };
    });
  }
}
