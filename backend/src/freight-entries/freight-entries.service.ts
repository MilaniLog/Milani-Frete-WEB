import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import type { Prisma } from '../generated/prisma/client';
import type { AuthUser } from '../auth/auth-user.types';
import { PrismaService } from '../prisma/prisma.service';
import { FreightCalculationService } from '../freight-calculation/freight-calculation.service';
import { EntryDto } from './dto/entry.dto';
import { StandaloneEntryDto } from './dto/standalone-entry.dto';
import { ExpenseDto } from './dto/expense.dto';
import { companyExpenses } from './company-expenses';
import { getWeek, periodForDate } from '../weeks/period-policy';

type Change =
  | { kind: 'create'; dto: EntryDto }
  | { kind: 'update'; id: number; dto: EntryDto }
  | { kind: 'delete'; id: number };

@Injectable()
export class FreightEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculation: FreightCalculationService,
  ) {}

  private unitWhere(user: AuthUser, unit?: number) {
    return user.isAdmin ? (unit == null ? {} : { unit }) : { unit: user.unit };
  }

  private unitFromRecord(user: AuthUser, record: { unit: number }) {
    return user.isAdmin ? record.unit : user.unit;
  }

  listExpenses(_user: AuthUser) {
    return this.prisma.frete_despesas.findMany({
      orderBy: { codigo: 'asc' },
    });
  }

  async findByNumber(numero: number, user: AuthUser) {
    const entry = await this.prisma.frete_lancamentos.findFirst({
      where: { numero, ...this.unitWhere(user) },
    });
    if (!entry)
      throw new NotFoundException('Lançamento não encontrado nesta unidade.');
    const manifesto =
      entry.manifesto_id != null
        ? await this.getManifest(this.prisma, entry.manifesto_id, user)
        : null;
    return { entry, manifesto };
  }

  async removeStandalone(id: number, user: AuthUser) {
    const existing = await this.prisma.frete_lancamentos.findFirst({
      where: { id, ...this.unitWhere(user) },
    });
    if (!existing)
      throw new NotFoundException('Lançamento não encontrado nesta unidade.');
    if (existing.manifesto_id != null)
      return this.changeEntry(existing.manifesto_id, user, {
        kind: 'delete',
        id,
      });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const entry = await tx.frete_lancamentos.findFirst({
              where: { id, ...this.unitWhere(user), manifesto_id: null },
            });
            if (!entry)
              throw new NotFoundException(
                'Lançamento não encontrado nesta unidade.',
              );
            if (entry.pago || entry.fechamento_id != null)
              throw new ConflictException(
                'Lançamento pago ou fechado não pode ser excluído.',
              );
            if (!entry.placa)
              throw new ConflictException(
                'Lançamento sem placa. Revise o cadastro antes de excluir.',
              );
            await periodForDate(
              tx,
              entry.data_lancamento,
              entry.semana ?? undefined,
            );
            await tx.frete_lancamentos.delete({
              where: {
                id,
                unit: entry.unit,
                manifesto_id: null,
                pago: false,
                fechamento_id: null,
              },
            });
            return { entry, manifesto: null };
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (e) {
        if (e.code !== 'P2034') throw e;
        if (attempt === 2)
          throw new ConflictException(
            'Conflito ao excluir lançamento. Tente novamente.',
          );
      }
    }
  }

  async createStandalone(dto: StandaloneEntryDto, user: AuthUser, id?: number) {
    if (!dto.semana || !/^\d{4}$/.test(dto.semana))
      throw new BadRequestException('Selecione uma semana válida.');
    if (id !== undefined) {
      const existing = await this.prisma.frete_lancamentos.findFirst({
        where: { id, ...this.unitWhere(user) },
      });
      if (!existing)
        throw new NotFoundException('Lançamento não encontrado nesta unidade.');
      if (existing.manifesto_id !== (dto.manifesto_id ?? null))
        throw new BadRequestException(
          'O vínculo com o manifesto não pode ser alterado na edição.',
        );
    }
    if (dto.manifesto_id) {
      const manifest = await this.getManifest(
        this.prisma,
        dto.manifesto_id,
        user,
      );
      if (manifest.placa !== dto.placa)
        throw new BadRequestException('A placa não corresponde ao manifesto.');
      return this.changeEntry(
        dto.manifesto_id,
        user,
        id === undefined
          ? { kind: 'create', dto }
          : { kind: 'update', id, dto },
      );
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const existing =
              id === undefined
                ? null
                : await tx.frete_lancamentos.findFirst({
                    where: { id, ...this.unitWhere(user), manifesto_id: null },
                  });
            if (id !== undefined && !existing)
              throw new NotFoundException(
                'Lançamento não encontrado nesta unidade.',
              );
            if (existing) {
              if (existing.pago || existing.fechamento_id != null)
                throw new ConflictException(
                  'Lançamento pago ou fechado não pode ser alterado.',
                );
              await periodForDate(
                tx,
                existing.data_lancamento,
                existing.semana ?? undefined,
              );
            }
            const vehicle = await tx.vehicle.findFirst({
              where: { plate: dto.placa, canceled: false },
            });
            if (!vehicle)
              throw new NotFoundException(
                'Veículo não encontrado ou cancelado.',
              );
            const type = await tx.vehicleType.findUnique({
              where: { codVehicleType: vehicle.codVehicleType },
            });
            if (!type)
              throw new NotFoundException('Tipo de veículo não encontrado.');
            const driver = dto.cpf_motorista
              ? await tx.driver.findUnique({
                  where: { cpf: BigInt(dto.cpf_motorista) },
                })
              : null;
            if (dto.cpf_motorista && !driver)
              throw new NotFoundException('Motorista não encontrado.');
            const expense = await tx.frete_despesas.findFirst({
              where: { id: dto.despesa_id, ativo: true },
            });
            if (!expense)
              throw new NotFoundException(
                'Despesa nao encontrada ou inativa.',
              );
            const date = new Date(`${dto.data_lancamento}T00:00:00.000Z`);
            const week = await periodForDate(
              tx,
              date,
              dto.semana,
            );
            const last = existing
              ? null
              : await tx.frete_lancamentos.aggregate({
                  where: { unit: existing?.unit ?? user.unit },
                  _max: { numero: true },
                });
            const data = {
              placa: dto.placa,
              semana: week.codigo,
              motorista:
                dto.cpf_motorista === undefined && existing
                  ? existing.motorista
                  : (driver?.name ?? null),
              tipo_veiculo: type.typeName,
              codigo_despesa: expense.codigo,
              nome_despesa: expense.nome,
              tipo_despesa: this.expenseType(expense.tipo),
              data_lancamento: date,
              valor: dto.valor,
              descricao: dto.descricao?.trim() || null,
              departamento: dto.departamento?.trim() || null,
              responsavel_cod: user.cod,
              updated_at: new Date(),
            };
            const entry = existing
              ? await tx.frete_lancamentos.update({
                  where: {
                    id: existing.id,
                    unit: existing.unit,
                    manifesto_id: null,
                  },
                  data,
                })
              : await tx.frete_lancamentos.create({
                  data: {
                    ...data,
                    unit: user.unit,
                    numero: (last!._max.numero ?? 0) + 1,
                    manifesto_id: null,
                    emitido_em: new Date(),
                  },
                });
            return { entry, manifesto: null };
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (e) {
        if (!['P2002', 'P2034'].includes(e.code)) throw e;
        if (attempt === 2)
          throw new ConflictException(
            'Conflito ao salvar lançamento. Tente novamente.',
          );
      }
    }
  }

  async saveExpense(dto: ExpenseDto, user: AuthUser, id?: number) {
    if (!user.isAdmin)
      throw new ForbiddenException(
        'Somente administradores podem alterar o cadastro de despesas.',
      );
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (id !== undefined) {
          const existing = await tx.frete_despesas.findFirst({
            where: { id },
          });
          if (!existing)
            throw new NotFoundException(
              'Despesa nao encontrada.',
            );
          // Lançamentos existentes preservam seu código, nome e tipo históricos.
          return tx.frete_despesas.update({
            where: { id },
            data: { ...dto, updated_at: new Date() },
          });
        }
        return tx.frete_despesas.create({ data: { ...dto, unit: 0 } });
      });
    } catch (error) {
      if (error.code === 'P2002')
        throw new ConflictException(
          'Codigo de despesa ja cadastrado.',
        );
      throw error;
    }
  }

  private async getManifest(
    tx: Pick<PrismaService, 'frete_carregamento_manifestos'>,
    id: number,
    user: AuthUser,
  ) {
    const manifest = await tx.frete_carregamento_manifestos.findFirst({
      where: { id, ...this.unitWhere(user) },
    });
    if (!manifest)
      throw new NotFoundException('Manifesto não encontrado nesta unidade.');
    return manifest;
  }

  async listEntries(manifestId: number, user: AuthUser, weekCode?: string) {
    const manifest = await this.getManifest(this.prisma, manifestId, user);
    const week = weekCode ? await getWeek(this.prisma, weekCode) : undefined;
    return this.prisma.frete_lancamentos.findMany({
      where: {
        manifesto_id: manifestId,
        unit: manifest.unit,
        ...(week
          ? { data_lancamento: { gte: week.data_inicio, lte: week.data_fim } }
          : {}),
      },
      orderBy: { numero: 'asc' },
    });
  }

  async changeEntry(manifestId: number, user: AuthUser, change: Change) {
    // Serialização + unicidade de (unit, numero) protegem numeração e recálculo.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const manifest = await this.getManifest(tx, manifestId, user);
            if (
              change.kind !== 'delete' &&
              'placa' in change.dto &&
              change.dto.placa !== manifest.placa
            )
              throw new BadRequestException(
                'A placa não corresponde ao manifesto.',
              );
            if (
              manifest.fechamento_id != null
            ) {
              throw new ConflictException(
                'Manifesto fechado não permite alterar lançamentos.',
              );
            }
            await periodForDate(
              tx,
              manifest.semana,
            );
            if (change.kind !== 'create') {
              const entry = await tx.frete_lancamentos.findFirst({
                where: {
                  id: change.id,
                  manifesto_id: manifestId,
                  unit: manifest.unit,
                },
              });
              if (!entry)
                throw new NotFoundException(
                  'Lançamento não encontrado neste manifesto.',
                );
              if (entry.pago || entry.fechamento_id != null)
                throw new ConflictException(
                  'Lançamento pago ou fechado não pode ser alterado.',
                );
              await periodForDate(
                tx,
                entry.data_lancamento,
                entry.semana ?? undefined,
              );
            }

            let entry;
            if (change.kind === 'delete') {
              entry = await tx.frete_lancamentos.delete({
                where: {
                  id: change.id,
                  unit: manifest.unit,
                  manifesto_id: manifestId,
                },
              });
            } else {
              const expense = await tx.frete_despesas.findFirst({
                where: {
                  id: change.dto.despesa_id,
                  ativo: true,
                },
              });
              if (!expense)
                throw new NotFoundException(
                'Despesa nao encontrada ou inativa.',
                );
              const tipo = this.expenseType(expense.tipo);
              const entryDate = new Date(
                `${change.dto.data_lancamento}T00:00:00.000Z`,
              );
              const week = await periodForDate(
                tx,
                entryDate,
                change.dto.semana,
              );
              const data = {
                codigo_despesa: expense.codigo,
                nome_despesa: expense.nome,
                tipo_despesa: tipo,
                data_lancamento: new Date(
                  `${change.dto.data_lancamento}T00:00:00.000Z`,
                ),
                valor: change.dto.valor,
                descricao: change.dto.descricao?.trim() || null,
                semana: week.codigo,
                departamento: change.dto.departamento?.trim() || null,
                responsavel_cod: user.cod,
                updated_at: new Date(),
              };
              if (change.kind === 'create') {
                const last = await tx.frete_lancamentos.aggregate({
                  where: { unit: manifest.unit },
                  _max: { numero: true },
                });
                entry = await tx.frete_lancamentos.create({
                  data: {
                    ...data,
                    numero: (last._max.numero ?? 0) + 1,
                    unit: manifest.unit,
                    manifesto_id: manifestId,
                    placa: manifest.placa,
                    motorista: manifest.motorista,
                    tipo_veiculo: manifest.tipo_veiculo,
                    destino: manifest.destino,
                  },
                });
              } else {
                entry = await tx.frete_lancamentos.update({
                  where: {
                    id: change.id,
                    unit: manifest.unit,
                    manifesto_id: manifestId,
                  },
                  data,
                });
              }
            }
            const updated = await this.recalculate(tx, manifest, user);
            return { entry, manifesto: updated };
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        if (error.code !== 'P2034' && error.code !== 'P2002') throw error;
        if (attempt === 2)
          throw new ConflictException(
            'Conflito ao salvar lançamento. Tente novamente.',
          );
      }
    }
  }

  private expenseType(value: string) {
    const types = {
      debito: 'Debito',
      credito: 'Credito',
      adiantamento: 'Adiantamento',
    };
    const key = value.trim().toLowerCase();
    const type = Object.prototype.hasOwnProperty.call(types, key)
      ? types[key]
      : undefined;
    if (!type) throw new BadRequestException('Tipo de despesa inválido.');
    return type as 'Debito' | 'Credito' | 'Adiantamento';
  }

  private async recalculate(
    tx: Prisma.TransactionClient,
    manifest: Awaited<ReturnType<FreightEntriesService['getManifest']>>,
    user: AuthUser,
  ) {
    const entries = await tx.frete_lancamentos.findMany({
      where: { manifesto_id: manifest.id, unit: manifest.unit },
    });
    const credit = companyExpenses(entries);
    const result = await this.calculation.calculate(
      {
        origem: manifest.origem,
        frete_veiculo: Number(manifest.frete_veiculo),
        cod_777_00: Number(manifest.cod_777_00),
        cod_888_00: Number(manifest.cod_888_00),
        cod_999_00: Number(manifest.cod_999_00),
        nao_777: Number(manifest.nao_777),
        nao_888: Number(manifest.nao_888),
        nao_999: Number(manifest.nao_999),
        outros: Number(manifest.outros),
        diaria: Number(manifest.diaria),
        tde: Number(manifest.tde),
        escada: Number(manifest.escada),
        paletizacao: Number(manifest.paletização),
        estadia: Number(manifest.estadia),
        descarga: Number(manifest.descarga),
        despesas_empresa: credit,
      },
      tx,
    );
    // Soma as parcelas já arredondadas, como AE + AF + AG na planilha
    // e no salvamento inicial do manifesto.
    const subtotal = new Decimal(result.freightsCalculated.notDelivery777)
      .plus(result.freightsCalculated.notDelivery888)
      .plus(result.freightsCalculated.notDelivery999);
    const extras = new Decimal(manifest.outros)
      .plus(manifest.diaria)
      .plus(manifest.tde)
      .plus(manifest.escada)
      .plus(manifest.paletização)
      .plus(manifest.estadia);
    return tx.frete_carregamento_manifestos.update({
      where: { id: manifest.id },
      data: {
        cod_777_15: result.freightsCalculated.freight777,
        cod_888_25: result.freightsCalculated.freight888,
        cod_999_100: result.freightsCalculated.freight999,
        nao_777_calc: result.freightsCalculated.notDelivery777,
        nao_888_calc: result.freightsCalculated.notDelivery888,
        nao_999_calc: result.freightsCalculated.notDelivery999,
        frete_calc: result.totalFretes,
        frt_tl_vlc: result.freightVehicle,
        sub_frete: result.freightVehicle,
        perc_carreg: result.initPercent,
        carreg_perc: result.initPercent,
        perc_final: result.finalPercent,
        final_perc: result.finalPercent,
        percentual_antigo: result.percentageCalculation.finalPercent,
        subtotal,
        sub_lc_ex: extras,
        sub_total: new Decimal(result.totalFretes).plus(extras).minus(subtotal),
      },
    });
  }
}
