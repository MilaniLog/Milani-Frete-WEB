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

  private unitWhere(user: AuthUser, unit?: number) {
    const targetUnit = user.isAdmin ? unit : user.unit;
    return targetUnit == null ? {} : { unit: targetUnit };
  }

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
        ...this.unitWhere(user),
        placa: dto.placa,
        semana: dates,
        fechamento_id: null,
      },
      orderBy: { id: 'asc' },
    });
    const targetUnit = manifests[0]?.unit ?? user.unit;
    const ids = manifests.map((row) => row.id);
    // Linked expenses follow their manifest, including expenses dated outside the week.
    const entries = await tx.frete_lancamentos.findMany({
      where: {
        OR: [
          { manifesto_id: { in: ids } },
          {
            unit: targetUnit,
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
    const debitSelection =
      dto.debit_entry_ids === undefined ? null : new Set(dto.debit_entry_ids);
    const selectedEntries =
      debitSelection === null
        ? entries
        : entries.filter(
            (row) =>
              row.tipo_despesa !== 'Debito' || debitSelection.has(row.id),
          );
    const selectedDebitIds = new Set(
      selectedEntries
        .filter((row) => row.tipo_despesa === 'Debito')
        .map((row) => row.id),
    );
    if (
      debitSelection &&
      [...debitSelection].some((id) => !selectedDebitIds.has(id))
    )
      throw new BadRequestException(
        'Selecao de debitos contem lancamento indisponivel para este fechamento.',
      );
    if (
      entries.some(
        (row) =>
          row.unit !== targetUnit ||
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
    const closureNumbers = [
      ...new Set(
        manifests
          .map((row) => row.num_fechamento)
          .filter((number): number is number => number != null),
      ),
    ];
    if (closureNumbers.length > 1)
      throw new ConflictException(
        'Ha mais de um numero de fechamento aberto para esta placa e semana.',
      );
    const coupons = await tx.frete_cupons.findMany({
      where: {
        unit: targetUnit,
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
      selectedEntries
        .filter((row) => row.tipo_despesa === 'Credito')
        .map((row) => row.valor),
    );
    const debits = sum(
      selectedEntries
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
      unit: targetUnit,
      semana: week.codigo,
      placa: dto.placa,
      motorista: manifests.find((row) => row.motorista)?.motorista ?? null,
      periodo_inicio: week.data_inicio,
      periodo_fim: week.data_fim,
      manifests,
      entries: selectedEntries,
      availableDebits: entries.filter((row) => row.tipo_despesa === 'Debito'),
      coupons,
      closureNumber: closureNumbers[0] ?? null,
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

  async adjustedWeekPreview(
    semana: string,
    user: AuthUser,
    selections: { placa: string; debit_entry_ids: number[] }[] = [],
  ) {
    return this.transaction(async (tx) => {
      const week = await getWeek(tx, semana);
      const dates = { gte: week.data_inicio, lte: week.data_fim };
      const manifests = await tx.frete_carregamento_manifestos.findMany({
        where: { ...this.unitWhere(user), semana: dates, fechamento_id: null },
        select: { placa: true },
      });
      const entries = await tx.frete_lancamentos.findMany({
        where: {
          ...this.unitWhere(user),
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
          ...this.unitWhere(user),
          data_cobranca: dates,
          pago: false,
          fechamento_id: null,
        },
        select: { placa: true },
      });
      const candidatePlates = [
        ...new Set(
          [...manifests, ...entries, ...coupons].map((row) => row.placa),
        ),
      ].sort();
      const registeredVehicles = await tx.vehicle.findMany({
        where: { plate: { in: candidatePlates } },
        select: { plate: true },
      });
      const registered = new Set(registeredVehicles.map((row) => row.plate));
      const plates = candidatePlates.filter((placa) => registered.has(placa));
      const selectionByPlate = new Map(
        selections.map((selection) => [
          selection.placa,
          selection.debit_entry_ids,
        ]),
      );
      return Promise.all(
        plates.map((placa) =>
          this.collect(
            tx,
            selectionByPlate.has(placa)
              ? { semana, placa, debit_entry_ids: selectionByPlate.get(placa) }
              : { semana, placa },
            user,
          ),
        ),
      );
    }, 60000);
  }

  finalizeWeek(
    semana: string,
    user: AuthUser,
    selections: { placa: string; debit_entry_ids: number[] }[] = [],
  ) {
    return this.transaction(async (tx) => {
      const week = await getWeek(tx, semana);
      const dates = { gte: week.data_inicio, lte: week.data_fim };
      const manifests = await tx.frete_carregamento_manifestos.findMany({
        where: {
          ...this.unitWhere(user),
          semana: dates,
          fechamento_id: null,
        },
        select: { placa: true },
      });
      const entries = await tx.frete_lancamentos.findMany({
        where: {
          ...this.unitWhere(user),
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
          ...this.unitWhere(user),
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
      const selectionByPlate = new Map(
        selections.map((selection) => [
          selection.placa,
          selection.debit_entry_ids,
        ]),
      );
      const unknownSelection = [...selectionByPlate.keys()].find(
        (placa) => !plates.includes(placa),
      );
      if (unknownSelection)
        throw new BadRequestException(
          `Selecao de debitos enviada para placa sem registros abertos: ${unknownSelection}.`,
        );
      const results: Awaited<
        ReturnType<FreightClosuresService['finalizeTransaction']>
      >[] = [];
      for (const placa of plates)
        results.push(
          await this.finalizeTransaction(
            tx,
            selectionByPlate.has(placa)
              ? { semana, placa, debit_entry_ids: selectionByPlate.get(placa) }
              : { semana, placa },
            user,
          ),
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
    const closureNumber =
      data.closureNumber ??
      (await this.nextClosureNumber(tx, data.unit, data.semana));
    const closure = await tx.frete_fechamentos.create({
      data: {
        numero: closureNumber,
        unit: data.unit,
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
        unit: data.unit,
        fechamento_id: null,
      },
      data: { fechamento_id: closure.id, num_fechamento: closure.numero },
    });
    const entries = await tx.frete_lancamentos.updateMany({
      where: {
        id: { in: data.entries.map((row) => row.id) },
        unit: data.unit,
        pago: false,
        fechamento_id: null,
      },
      data: { fechamento_id: closure.id, pago: true },
    });
    const coupons = await tx.frete_cupons.updateMany({
      where: {
        id: { in: data.coupons.map((row) => row.id) },
        unit: data.unit,
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
      where: this.unitWhere(user),
      orderBy: { id: 'desc' },
      take: 50,
    });
  }
  async findByNumber(numero: number, user: AuthUser) {
    const closure = await this.prisma.frete_fechamentos.findFirst({
      where: { numero, ...this.unitWhere(user) },
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
        where: { id, ...this.unitWhere(user) },
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
          (row) => row.unit !== closure.unit || row.placa !== closure.placa,
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
        where: { id, unit: closure.unit, status: 'FECHADO' },
        data: { status: 'CANCELADO', historico },
      });
      if (changed.count !== 1)
        throw new ConflictException('Fechamento alterado simultaneamente.');
      const scope = { ...where, unit: closure.unit };
      const m = await tx.frete_carregamento_manifestos.updateMany({
        where: scope,
        data: { fechamento_id: null, num_fechamento: closure.numero },
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
        where: { id, ...this.unitWhere(user) },
      });
      if (!closure) throw new NotFoundException('Fechamento não encontrado.');
      const where = { unit: closure.unit, fechamento_id: id };
      return {
        closure,
        manifests: await tx.frete_carregamento_manifestos.findMany({ where }),
        entries: await tx.frete_lancamentos.findMany({ where }),
        coupons: await tx.frete_cupons.findMany({ where }),
      };
    });
  }

  private async nextClosureNumber(
    tx: Prisma.TransactionClient,
    unit: number,
    semana: string,
  ) {
    const base = Number(semana) * 10000;
    const range = { gte: base + 1, lte: base + 9999 };
    const [lastManifest, lastClosure] = await Promise.all([
      tx.frete_carregamento_manifestos.findFirst({
        where: { unit, num_fechamento: range },
        orderBy: { num_fechamento: 'desc' },
        select: { num_fechamento: true },
      }),
      tx.frete_fechamentos.findFirst({
        where: { unit, numero: range },
        orderBy: { numero: 'desc' },
        select: { numero: true },
      }),
    ]);
    const last = Math.max(
      lastManifest?.num_fechamento ?? base,
      lastClosure?.numero ?? base,
    );
    if (last >= base + 9999)
      throw new ConflictException(
        `A semana ${semana} atingiu o limite de 9999 fechamentos.`,
      );
    return last + 1;
  }
}
