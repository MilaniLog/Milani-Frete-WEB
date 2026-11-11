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
import { hasGlobalFreightAccess } from '../auth/freight-access';
import { getWeek } from '../weeks/period-policy';
import {
  CancelClosureDto,
  ClosureDraftQueryDto,
  ClosureDto,
  ConferenceDto,
  WeekClosureDto,
} from './freight-closures.dto';
import { allocatePayment } from './payment-allocation';
import { savedReport } from './closure-report';

@Injectable()
export class FreightClosuresService {
  constructor(private readonly prisma: PrismaService) {}

  private unitWhere(user: AuthUser, unit?: number) {
    const targetUnit = hasGlobalFreightAccess(user) ? unit : user.unit;
    return targetUnit == null ? {} : { unit: targetUnit };
  }

  private async scopeWhere(tx: Prisma.TransactionClient, user: AuthUser, dto: { unit?: number; local?: string; dominio?: 'MLN' | 'LOOG' } = {}) {
    if (!hasGlobalFreightAccess(user)) return { unit: user.unit };
    if (dto.unit != null) return { unit: dto.unit };
    if (!dto.local && !dto.dominio) return {};
    const branches = await tx.branches.findMany({
      where: { ...(dto.local ? { branch: dto.local } : {}), ...(dto.dominio ? { dominio: dto.dominio } : {}) },
      select: { unit: true },
    });
    return { unit: { in: branches.map((branch) => branch.unit) } };
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
        cancelado: false,
        ...await this.scopeWhere(tx, user, dto),
        placa: dto.placa,
        semana: dates,
        fechamento_id: null,
      },
      orderBy: { id: 'asc' },
    });
    const manifestIds = manifests.map((row) => row.id);
    const manifestNumbers = manifests
      .flatMap((row) => [
        row.manifestos,
        row.manifesto_adicional_1,
        row.manifesto_adicional_2,
        row.manifesto_adicional_3,
      ])
      .filter((number): number is string => Boolean(number));
    const weekManifestReferences = await tx.frete_carregamento_manifestos.findMany({
      where: {
        cancelado: false,
        ...await this.scopeWhere(tx, user, dto),
        placa: dto.placa,
        semana: dates,
      },
    });
    const priorityManifestIds = weekManifestReferences.map((row) => row.id);
    const priorityManifestNumbers = weekManifestReferences
      .flatMap((row) => [
        row.manifestos,
        row.manifesto_adicional_1,
        row.manifesto_adicional_2,
        row.manifesto_adicional_3,
      ])
      .filter((number): number is string => Boolean(number));
    // Common debits remain available until selected. Credits and advances belong
    // only to the selected week. Code 3333 follows its manifest in that week.
    const entries = await tx.frete_lancamentos.findMany({
      where: {
        placa: dto.placa,
        cancelado: false,
        pago: false,
        fechamento_id: null,
        OR: [
          {
            tipo_despesa: 'Debito',
            codigo_despesa: { not: '3333' },
          },
          {
            codigo_despesa: '3333',
            OR: [
              { manifesto_id: { in: priorityManifestIds } },
              {
                manifesto_id: null,
                manifesto_numero: { in: priorityManifestNumbers },
              },
            ],
          },
          {
            tipo_despesa: { in: ['Credito', 'Adiantamento'] },
            OR: [
              { manifesto_id: { in: priorityManifestIds } },
              {
                manifesto_id: null,
                manifesto_numero: { in: priorityManifestNumbers },
              },
              {
                manifesto_id: null,
                manifesto_numero: null,
                data_lancamento: dates,
              },
            ],
          },
        ],
      },
      orderBy: { id: 'asc' },
    });
    const referenceManifestIds = [
      ...new Set(
        entries
          .map((row) => row.manifesto_id)
          .filter(
            (id): id is number =>
              id != null &&
              !manifestIds.includes(id) &&
              !priorityManifestIds.includes(id),
          ),
      ),
    ];
    const referenceManifests = [
      ...weekManifestReferences.filter((row) => !manifestIds.includes(row.id)),
      ...(referenceManifestIds.length
        ? await tx.frete_carregamento_manifestos.findMany({
            where: { id: { in: referenceManifestIds }, cancelado: false },
          })
        : []),
    ];
    const targetUnit =
      manifests[0]?.unit ??
      referenceManifests[0]?.unit ??
      entries[0]?.unit ??
      user.unit;
    const debitSelection =
      dto.debit_entry_ids === undefined ? null : new Set(dto.debit_entry_ids);
    const selectedEntries =
      debitSelection === null
        ? entries
        : entries.filter(
            (row) =>
              row.tipo_despesa !== 'Debito' ||
              String(row.codigo_despesa ?? '').trim() === '3333' ||
              debitSelection.has(row.id),
          );
    const selectedDebitIds = new Set(
      selectedEntries
        .filter(
          (row) =>
            row.tipo_despesa === 'Debito' &&
            String(row.codigo_despesa ?? '').trim() !== '3333',
        )
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
          row.placa !== dto.placa ||
          row.pago ||
          row.fechamento_id !== null,
      )
    )
      throw new ConflictException(
        'Manifesto possui vale incompatível ou já fechado.',
      );
    if (
      entries.some(
        (row) =>
          !['Credito', 'Debito', 'Adiantamento'].includes(row.tipo_despesa),
      )
    )
      throw new ConflictException('Tipo de vale desconhecido.');
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
    const ctrbNumbers = manifests
      .map((row) => String(row.ctrb_numero ?? '').trim())
      .filter(Boolean);
    const duplicatedCtrb = ctrbNumbers.find(
      (number, index) => ctrbNumbers.indexOf(number) !== index,
    );
    if (duplicatedCtrb)
      throw new ConflictException(
        `O CTRB ${duplicatedCtrb} está repetido nos manifestos desta placa. Corrija os manifestos antes de fechar.`,
      );
    const availableCoupons = await tx.frete_cupons.findMany({
      where: {
        placa: dto.placa,
        pago: false,
        fechamento_id: null,
      },
      include: {
        nota: { select: { codigo_tipo: true, nome_tipo: true } },
      },
      orderBy: { id: 'asc' },
    });
    const couponSelection =
      dto.coupon_ids === undefined ? null : new Set(dto.coupon_ids);
    const coupons =
      couponSelection === null
        ? availableCoupons
        : availableCoupons.filter((row) => couponSelection.has(row.id));
    if (
      couponSelection &&
      [...couponSelection].some(
        (id) => !availableCoupons.some((coupon) => coupon.id === id),
      )
    )
      throw new BadRequestException(
        'Selecao de cupons contem cupom indisponivel para este fechamento.',
      );
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
        .filter(
          (row) =>
            row.tipo_despesa === 'Debito' &&
            String(row.codigo_despesa ?? '').trim() !== '3333',
        )
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
    const originRows = manifests.length ? manifests : referenceManifests;
    const originUnits = [
      ...new Set(
        originRows
          .map((row) => row.unit)
          .filter((unit): unit is number => Number.isInteger(unit)),
      ),
    ];
    const originBranches = originUnits.length
      ? await tx.branches.findMany({
          where: { unit: { in: originUnits } },
          select: { unit: true, branch: true },
        })
      : [];
    const branchByUnit = new Map(
      originBranches.map((branch) => [branch.unit, branch.branch]),
    );
    const origins = [
      ...new Set(
        originRows
          .map((row) => branchByUnit.get(row.unit) || row.origem)
          .filter(Boolean),
      ),
    ];
    return {
      payment,
      beneficiario: {
        documento: vehicle.owner ?? null,
        nome: vehicle.owner_name ?? null,
      },
      unit: targetUnit,
      semana: week.codigo,
      placa: dto.placa,
      motorista:
        manifests.find((row) => row.motorista)?.motorista ??
        referenceManifests.find((row) => row.motorista)?.motorista ??
        entries.find((row) => row.motorista)?.motorista ??
        null,
      tipoVeiculo:
        manifests.find((row) => row.tipo_veiculo)?.tipo_veiculo ??
        referenceManifests.find((row) => row.tipo_veiculo)?.tipo_veiculo ??
        entries.find((row) => row.tipo_veiculo)?.tipo_veiculo ??
        coupons.find((row) => row.tipo_veiculo)?.tipo_veiculo ??
        null,
      origem: origins.join(' / ') || null,
      periodo_inicio: week.data_inicio,
      periodo_fim: week.data_fim,
      manifests,
      entries: selectedEntries,
      availableDebits: entries.filter(
        (row) =>
          row.tipo_despesa === 'Debito' &&
          String(row.codigo_despesa ?? '').trim() !== '3333',
      ),
      availableCoupons,
      coupons,
      closureNumber: closureNumbers[0] ?? null,
      totals: {
        fretes: money(freight),
        creditos: money(credits),
        debitos: money(debits),
        cupons: money(couponValue),
        total_bruto: money(gross),
        total_liquido: money(gross.minus(debits).minus(couponValue)),
        total_ctrb: money(sum(manifests.map((row) => row.ctrb_total))),
      },
    };
  }

  preview(dto: ClosureDto, user: AuthUser) {
    return this.transaction((tx) => this.collect(tx, dto, user));
  }

  private numericDraftIds(value: Prisma.JsonValue): number[] {
    return Array.isArray(value)
      ? value.filter((id): id is number => Number.isInteger(id) && Number(id) > 0)
      : [];
  }

  private async draftResponse(tx: Prisma.TransactionClient, rows: any[]) {
    const codes = [...new Set(rows.map((row) => row.responsavel_cod))];
    const users = codes.length
      ? await tx.employees.findMany({
          where: { cod: { in: codes } },
          select: { cod: true, Name: true },
        })
      : [];
    const names = new Map(users.map((employee) => [employee.cod, employee.Name]));
    const latest = [...rows].sort(
      (left, right) => right.updated_at.getTime() - left.updated_at.getTime(),
    )[0];
    return {
      selections: rows.map((row) => ({
        placa: row.placa,
        debit_entry_ids: this.numericDraftIds(row.debit_entry_ids),
        coupon_ids: this.numericDraftIds(row.coupon_ids),
      })),
      lastUpdate: latest
        ? {
            responsavel_cod: latest.responsavel_cod,
            responsavel_nome: names.get(latest.responsavel_cod) ?? null,
            updated_at: latest.updated_at,
          }
        : null,
    };
  }

  drafts(dto: ClosureDraftQueryDto, user: AuthUser) {
    return this.transaction(async (tx) => {
      const rows = await tx.frete_fechamento_rascunhos.findMany({
        where: {
          semana: dto.semana,
          ...(await this.scopeWhere(tx, user, dto)),
        },
        orderBy: [{ placa: 'asc' }],
      });
      return this.draftResponse(tx, rows);
    });
  }

  saveDrafts(dto: WeekClosureDto, user: AuthUser) {
    return this.transaction(async (tx) => {
      const selections = dto.selections ?? [];
      const plates = selections.map((selection) => selection.placa);
      const week = await getWeek(tx, dto.semana);
      const dates = { gte: week.data_inicio, lte: week.data_fim };
      const scope = await this.scopeWhere(tx, user, dto);
      const [manifestPlates, entryPlates, scopedCouponPlates] = plates.length
        ? await Promise.all([
            tx.frete_carregamento_manifestos.findMany({
              where: {
                ...scope,
                placa: { in: plates },
                cancelado: false,
                semana: dates,
                fechamento_id: null,
              },
              select: { placa: true, unit: true },
            }),
            tx.frete_lancamentos.findMany({
              where: {
                ...scope,
                placa: { in: plates },
                cancelado: false,
                data_lancamento: dates,
                pago: false,
                fechamento_id: null,
                OR: [
                  {
                    tipo_despesa: { in: ['Credito', 'Adiantamento'] },
                    manifesto_id: null,
                    manifesto_numero: null,
                  },
                  { tipo_despesa: 'Debito', manifesto_id: null },
                ],
              },
              select: { placa: true, unit: true },
            }),
            tx.frete_cupons.findMany({
              where: {
                ...scope,
                placa: { in: plates },
                data_cobranca: dates,
                pago: false,
                fechamento_id: null,
              },
              select: { placa: true, unit: true },
            }),
          ])
        : [[], [], []];
      const units = new Map<string, number>();
      for (const row of [...manifestPlates, ...entryPlates, ...scopedCouponPlates])
        if (!units.has(row.placa)) units.set(row.placa, row.unit);
      if (plates.some((plate) => !units.has(plate)))
        throw new ForbiddenException(
          'O rascunho contém placa fora das unidades permitidas.',
        );

      const debitIds = selections.flatMap((selection) => selection.debit_entry_ids);
      const couponIds = selections.flatMap((selection) => selection.coupon_ids);
      const [debits, coupons] = await Promise.all([
        debitIds.length
          ? tx.frete_lancamentos.findMany({
              where: {
                id: { in: debitIds },
                cancelado: false,
                pago: false,
                fechamento_id: null,
                tipo_despesa: 'Debito',
                codigo_despesa: { not: '3333' },
              },
              select: { id: true, placa: true },
            })
          : [],
        couponIds.length
          ? tx.frete_cupons.findMany({
              where: {
                id: { in: couponIds },
                pago: false,
                fechamento_id: null,
              },
              select: { id: true, placa: true },
            })
          : [],
      ]);
      const debitPlates = new Map<number, string>(
        debits.map((entry) => [entry.id, entry.placa] as const),
      );
      const couponPlates = new Map<number, string>(
        coupons.map((coupon) => [coupon.id, coupon.placa] as const),
      );
      const invalid = selections.some(
        (selection) =>
          selection.debit_entry_ids.some((id) => debitPlates.get(id) !== selection.placa) ||
          selection.coupon_ids.some((id) => couponPlates.get(id) !== selection.placa),
      );
      if (invalid)
        throw new BadRequestException(
          'O rascunho contém vale ou cupom indisponível para a placa.',
        );

      await Promise.all(selections.map((selection) =>
        tx.frete_fechamento_rascunhos.upsert({
          where: {
            semana_placa: { semana: dto.semana, placa: selection.placa },
          },
          create: {
            semana: dto.semana,
            placa: selection.placa,
            unit: units.get(selection.placa)!,
            debit_entry_ids: selection.debit_entry_ids,
            coupon_ids: selection.coupon_ids,
            responsavel_cod: user.cod,
          },
          update: {
            unit: units.get(selection.placa)!,
            debit_entry_ids: selection.debit_entry_ids,
            coupon_ids: selection.coupon_ids,
            responsavel_cod: user.cod,
          },
        }),
      ));
      const rows = await tx.frete_fechamento_rascunhos.findMany({
        where: {
          semana: dto.semana,
          ...(await this.scopeWhere(tx, user, dto)),
        },
        orderBy: [{ placa: 'asc' }],
      });
      return this.draftResponse(tx, rows);
    });
  }

  async adjustedWeekPreview(
    semana: string,
    user: AuthUser,
    selections: { placa: string; debit_entry_ids: number[]; coupon_ids: number[] }[] = [],
    scope: { unit?: number; local?: string; dominio?: 'MLN' | 'LOOG' } = {},
    requestedPlates?: string[],
  ) {
    return this.transaction(async (tx) => {
      const week = await getWeek(tx, semana);
      const dates = { gte: week.data_inicio, lte: week.data_fim };
      const manifests = await tx.frete_carregamento_manifestos.findMany({
        where: { ...await this.scopeWhere(tx, user, scope), cancelado: false, semana: dates, fechamento_id: null },
        select: { placa: true },
      });
      const entries = await tx.frete_lancamentos.findMany({
        where: {
          ...await this.scopeWhere(tx, user, scope),
          cancelado: false,
          data_lancamento: dates,
          pago: false,
          fechamento_id: null,
          OR: [
            {
              tipo_despesa: { in: ['Credito', 'Adiantamento'] },
              manifesto_id: null,
              manifesto_numero: null,
            },
            { tipo_despesa: 'Debito', manifesto_id: null },
          ],
        },
        select: { placa: true },
      });
      const coupons = await tx.frete_cupons.findMany({
        where: {
          ...await this.scopeWhere(tx, user, scope),
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
      const requested = requestedPlates?.length
        ? new Set(requestedPlates)
        : null;
      const plates = candidatePlates.filter(
        (placa) => registered.has(placa) && (!requested || requested.has(placa)),
      );
      const selectionByPlate = new Map(
        selections.map((selection) => [selection.placa, selection]),
      );
      return Promise.all(
        plates.map((placa) =>
          this.collect(
            tx,
            selectionByPlate.has(placa)
              ? { ...scope, semana, placa, ...selectionByPlate.get(placa) }
              : { ...scope, semana, placa },
            user,
          ),
        ),
      );
    }, 60000);
  }

  finalizeWeek(
    semana: string,
    user: AuthUser,
    selections: { placa: string; debit_entry_ids: number[]; coupon_ids: number[] }[] = [],
    reviewedPlates?: string[],
    scope: { unit?: number; local?: string; dominio?: 'MLN' | 'LOOG' } = {},
  ) {
    return this.transaction(async (tx) => {
      const week = await getWeek(tx, semana);
      const dates = { gte: week.data_inicio, lte: week.data_fim };
      const manifests = await tx.frete_carregamento_manifestos.findMany({
        where: {
          ...await this.scopeWhere(tx, user, scope),
          cancelado: false,
          semana: dates,
          fechamento_id: null,
        },
        select: { placa: true },
      });
      const entries = await tx.frete_lancamentos.findMany({
        where: {
          ...await this.scopeWhere(tx, user, scope),
          cancelado: false,
          data_lancamento: dates,
          pago: false,
          fechamento_id: null,
          OR: [
            {
              tipo_despesa: { in: ['Credito', 'Adiantamento'] },
              manifesto_id: null,
              manifesto_numero: null,
            },
            { tipo_despesa: 'Debito', manifesto_id: null },
          ],
        },
        select: { placa: true },
      });
      const coupons = await tx.frete_cupons.findMany({
        where: {
          ...await this.scopeWhere(tx, user, scope),
          data_cobranca: dates,
          pago: false,
          fechamento_id: null,
        },
        select: { placa: true },
      });
      const openPlates = [
        ...new Set(
          [...manifests, ...entries, ...coupons].map((row) => row.placa),
        ),
      ].sort();
      if (!openPlates.length && !reviewedPlates?.length)
        throw new BadRequestException('Não há registros abertos nesta semana.');
      const plates = reviewedPlates ?? openPlates;
      if (!plates.length)
        throw new BadRequestException('Selecione ao menos uma placa revisada para fechar.');
      const selectionByPlate = new Map(
        selections.map((selection) => [selection.placa, selection]),
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
              ? { ...scope, semana, placa, ...selectionByPlate.get(placa) }
              : { ...scope, semana, placa },
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
    if (new Decimal(data.totals.total_liquido).isNegative())
      throw new BadRequestException(
        `Não é possível fechar a placa ${data.placa}: o valor líquido está negativo (${data.totals.total_liquido.toFixed(2)}).`,
      );
    const cancelledNumber =
      data.closureNumber == null
        ? null
        : await tx.frete_fechamentos.findFirst({
            where: {
              numero: data.closureNumber,
              status: 'CANCELADO',
            },
            select: { id: true },
          });
    const closureNumber =
      data.closureNumber == null || cancelledNumber
        ? await this.nextClosureNumber(tx, data.semana)
        : data.closureNumber;
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
        alterado_por: user.cod,
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
      data: { fechamento_id: closure.id, num_fechamento: closure.numero, alterado_por: user.cod },
    });
    const entries = await tx.frete_lancamentos.updateMany({
      where: {
        id: { in: data.entries.map((row) => row.id) },
        cancelado: false,
        placa: data.placa,
        pago: false,
        fechamento_id: null,
      },
      data: { fechamento_id: closure.id, pago: true, alterado_por: user.cod },
    });
    const coupons = await tx.frete_cupons.updateMany({
      where: {
        id: { in: data.coupons.map((row) => row.id) },
        placa: data.placa,
        pago: false,
        fechamento_id: null,
      },
      data: { fechamento_id: closure.id, pago: true, alterado_por: user.cod },
    });
    if (
      manifests.count !== data.manifests.length ||
      entries.count !== data.entries.length ||
      coupons.count !== data.coupons.length
    )
      throw new ConflictException('Registros alterados durante o fechamento.');
    await tx.frete_fechamento_rascunhos.deleteMany({
      where: { semana: data.semana, placa: data.placa },
    });
    return { closure, totals: data.totals, payment: data.payment };
  }

  list(user: AuthUser, numero?: string) {
    const searched = numero?.trim();
    return this.prisma.frete_fechamentos.findMany({
      where: {
        ...this.unitWhere(user),
        ...(searched && /^\d+$/.test(searched) ? { numero: Number(searched) } : {}),
      },
      orderBy: { id: 'desc' },
      take: searched ? 10 : 50,
    });
  }

  historicalConference(dto: ConferenceDto, user: AuthUser) {
    return this.transaction(async (tx) => {
      if ((dto.inicio && !dto.fim) || (!dto.inicio && dto.fim))
        throw new BadRequestException('Preencha início e fim.');
      if (dto.semana && (dto.inicio || dto.fim))
        throw new BadRequestException('Escolha semana ou período de pesquisa.');
      if (!dto.semana && !dto.inicio)
        throw new BadRequestException(
          'Escolha uma semana ou informe início e fim.',
        );
      const week = dto.semana ? await getWeek(tx, dto.semana) : null;
      const start = week?.data_inicio ?? new Date(`${dto.inicio}T00:00:00Z`);
      const end = week?.data_fim ?? new Date(`${dto.fim}T00:00:00Z`);
      if (start > end)
        throw new BadRequestException('Início deve ser anterior ao fim.');
      const vehicleFilter =
        dto.tipo || (dto.categoria && dto.categoria !== 'Todos')
          ? await tx.vehicle.findMany({
              where: {
                ...(dto.placa ? { plate: dto.placa } : {}),
                ...(dto.tipo
                  ? { codVehicleType: Number(dto.tipo) }
                  : dto.categoria === 'Agregado'
                    ? { codVehicleType: { lt: 100 } }
                    : { codVehicleType: { gte: 100 } }),
              },
              select: { plate: true },
            })
          : null;
      const closures = await tx.frete_fechamentos.findMany({
        where: {
          status: 'FECHADO',
          ...await this.scopeWhere(tx, user, dto),
          ...(dto.numero ? { numero: Number(dto.numero) } : {}),
          ...(dto.placa ? { placa: dto.placa } : {}),
          ...(vehicleFilter
            ? { placa: { in: vehicleFilter.map((vehicle) => vehicle.plate) } }
            : {}),
          ...(dto.semana
            ? { semana: dto.semana }
            : {
                periodo_inicio: { gte: start },
                periodo_fim: { lte: end },
              }),
        },
        orderBy: [{ placa: 'asc' }, { numero: 'asc' }],
      });
      const groups = [];
      for (const closure of closures) {
        const detail = {
          closure,
          manifests: await tx.frete_carregamento_manifestos.findMany({
            where: { unit: closure.unit, fechamento_id: closure.id },
          }),
          entries: await tx.frete_lancamentos.findMany({
            where: {
              placa: closure.placa,
              fechamento_id: closure.id,
              cancelado: false,
            },
          }),
          coupons: await tx.frete_cupons.findMany({
            where: { placa: closure.placa, fechamento_id: closure.id },
            include: {
              nota: { select: { codigo_tipo: true, nome_tipo: true } },
            },
          }),
        };
        const report = savedReport(detail);
        if (
          dto.usuario &&
          !report.entries.some(
            (entry) => Number(entry.responsavel_cod) === Number(dto.usuario),
          ) &&
          !report.coupons.some(
            (coupon) => Number(coupon.responsavel_cod) === Number(dto.usuario),
          ) &&
          !report.manifests.some(
            (manifest) => String(manifest.usuario ?? '') === dto.usuario,
          )
        ) continue;
        if (
          dto.despesa &&
          !report.entries.some(
            (entry) => String(entry.codigo_despesa) === dto.despesa,
          )
        ) continue;
        if (
          dto.mista === 'true' &&
          !report.manifests.some(
            (manifest) =>
              manifest.carga_mista ||
              [manifest.cod_777_00, manifest.cod_888_00, manifest.cod_999_00]
                .filter((value) => Number(value) > 0).length > 1,
          )
        ) continue;
        groups.push({
          unit: closure.unit,
          semana: closure.semana ?? dto.semana ?? '',
          placa: closure.placa,
          motorista:
            report.manifests.find((row) => row.motorista)?.motorista ??
            report.entries.find((row) => row.motorista)?.motorista ??
            report.coupons.find((row) => row.motorista)?.motorista ??
            null,
          tipoVeiculo:
            report.manifests.find((row) => row.tipo_veiculo)?.tipo_veiculo ??
            report.entries.find((row) => row.tipo_veiculo)?.tipo_veiculo ??
            report.coupons.find((row) => row.tipo_veiculo)?.tipo_veiculo ??
            null,
          origem:
            [...new Set(report.manifests.map((row) => row.origem).filter(Boolean))]
              .join(' / ') || null,
          closureNumber: closure.numero,
          isClosed: true,
          periodo_inicio: closure.periodo_inicio,
          periodo_fim: closure.periodo_fim,
          manifests: report.manifests,
          entries: report.entries,
          coupons: report.coupons,
          totals: report.totals,
          payment: report.payment,
          cabecalho: report.cabecalho,
          titulo: report.titulo,
          reportOrigin: report.origem,
        });
      }
      return {
        groups,
        periodo_inicio: start,
        periodo_fim: end,
        filtros: dto,
      };
    }, 30000);
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
    if (!user.isAdmin && !user.deletionApprovedBy)
      throw new ForbiddenException(
        'Esta exclusão precisa da autorização de um administrador.',
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
      const entries = await tx.frete_lancamentos.findMany({
        where: { ...where, cancelado: false },
      });
      const coupons = await tx.frete_cupons.findMany({ where });
      if (
        manifests.some(
          (row) => row.unit !== closure.unit || row.placa !== closure.placa,
        ) ||
        [...entries, ...coupons].some(
          (row) => row.placa !== closure.placa,
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
        data: { status: 'CANCELADO', historico, alterado_por: user.cod },
      });
      if (changed.count !== 1)
        throw new ConflictException('Fechamento alterado simultaneamente.');
      const manifestScope = { ...where, unit: closure.unit };
      const plateScope = { ...where, placa: closure.placa };
      const m = await tx.frete_carregamento_manifestos.updateMany({
        where: manifestScope,
        data: { fechamento_id: null, num_fechamento: null, alterado_por: user.cod },
      });
      const e = await tx.frete_lancamentos.updateMany({
        where: { ...plateScope, cancelado: false },
        data: { fechamento_id: null, pago: false, alterado_por: user.cod },
      });
      const c = await tx.frete_cupons.updateMany({
        where: plateScope,
        data: { fechamento_id: null, pago: false, alterado_por: user.cod },
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
      const manifestWhere = { unit: closure.unit, fechamento_id: id };
      const plateWhere = { placa: closure.placa, fechamento_id: id };
      return {
        closure,
        manifests: await tx.frete_carregamento_manifestos.findMany({ where: manifestWhere }),
        entries: await tx.frete_lancamentos.findMany({
          where: { ...plateWhere, cancelado: false },
        }),
        coupons: await tx.frete_cupons.findMany({
          where: plateWhere,
          include: {
            nota: { select: { codigo_tipo: true, nome_tipo: true } },
          },
        }),
      };
    });
  }

  private async nextClosureNumber(
    tx: Prisma.TransactionClient,
    semana: string,
  ) {
    const base = Number(semana) * 10000;
    const range = { gte: base + 1, lte: base + 9999 };
    const [lastManifest, lastClosure] = await Promise.all([
      tx.frete_carregamento_manifestos.findFirst({
        where: { num_fechamento: range },
        orderBy: { num_fechamento: 'desc' },
        select: { num_fechamento: true },
      }),
      tx.frete_fechamentos.findFirst({
        where: { numero: range },
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
