import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user.types';
import { getWeek } from '../weeks/period-policy';
import { ConferenceDto } from './freight-closures.dto';
@Injectable()
export class ConferenceService {
  constructor(private readonly db: PrismaService) {}
  async report(dto: ConferenceDto, user: AuthUser) {
    if ((dto.inicio && !dto.fim) || (!dto.inicio && dto.fim))
      throw new BadRequestException('Preencha início e fim.');
    if (dto.semana && (dto.inicio || dto.fim))
      throw new BadRequestException('Escolha semana ou período de pesquisa.');
    if (!dto.semana && !dto.inicio)
      throw new BadRequestException(
        'Escolha uma semana ou informe início e fim.',
      );
    return this.db.$transaction(
      async (tx) => {
        const w = dto.semana ? await getWeek(tx, dto.semana) : null;
        const start = w?.data_inicio ?? new Date(`${dto.inicio}T00:00:00Z`),
          end = w?.data_fim ?? new Date(`${dto.fim}T00:00:00Z`);
        if (start > end)
          throw new BadRequestException('Início deve ser anterior ao fim.');
        const dates = { gte: start, lte: end };
        const closure = dto.numero
          ? await tx.frete_fechamentos.findFirst({
              where: { unit: user.unit, numero: Number(dto.numero) },
            })
          : null;
        if (dto.numero && !closure)
          throw new NotFoundException(
            'Fechamento não encontrado nesta unidade.',
          );
        const all = dto.finalizados === 'true' || !!closure;
        const vehicles = await tx.vehicle.findMany({
          select: {plate:true,codVehicleType:true,empresa_sigla:true,first_payer:true},
          where: {
            ...(dto.placa ? { plate: dto.placa } : {}),
            ...(dto.tipo
              ? { codVehicleType: Number(dto.tipo) }
              : dto.categoria === 'Agregado'
                ? { codVehicleType: { lt: 100 } }
                : dto.categoria === 'Esporadico'
                  ? { codVehicleType: { gte: 100 } }
                  : {}),
          },
        });
        const plates = vehicles.map((v) => v.plate);
        let manifests = await tx.frete_carregamento_manifestos.findMany({
          where: {
            unit: user.unit,
            placa: { in: plates },
            semana: dates,
            ...(dto.usuario ? { usuario: dto.usuario } : {}),
            ...(closure
              ? {
                  OR: [
                    { fechamento_id: closure.id },
                    { num_fechamento: closure.numero },
                  ],
                }
              : all
                ? {}
                : { fechamento_id: null }),
          },
          orderBy:
            dto.ordenar_data === 'true'
              ? [{ semana: 'asc' }, { manifestos: 'asc' }]
              : { id: 'asc' },
        });
        if (dto.mista === 'true')
          manifests = manifests.filter(
            (m) =>
              m.carga_mista ||
              [m.cod_777_00, m.cod_888_00, m.cod_999_00].filter(
                (v) => Number(v) > 0,
              ).length > 1,
          );
        const ids = manifests.map((m) => m.id);
        const entries = await tx.frete_lancamentos.findMany({
          where: {
            unit: user.unit,
            placa: { in: plates },
            ...(dto.usuario ? { responsavel_cod: Number(dto.usuario) } : {}),
            ...(closure
              ? { fechamento_id: closure.id }
              : all
                ? {}
                : { fechamento_id: null, pago: false }),
            OR: [
              { manifesto_id: { in: ids } },
              ...(dto.mista === 'true'
                ? []
                : [
                    {
                      manifesto_id: null,
                      data_lancamento: dates,
                      tipo_despesa: { in: ['Credito', 'Debito'] },
                    },
                  ]),
            ],
          },
          orderBy: { numero: 'asc' },
        });
        const coupons =
          dto.mista === 'true'
            ? []
            : await tx.frete_cupons.findMany({
                where: {
                  unit: user.unit,
                  placa: { in: plates },
                  data_cobranca: dates,
                  ...(dto.usuario
                    ? { responsavel_cod: Number(dto.usuario) }
                    : {}),
                  ...(closure
                    ? { fechamento_id: closure.id }
                    : all
                      ? {}
                      : { fechamento_id: null, pago: false }),
                },
                orderBy: { id: 'asc' },
              });
        const sum = (values: unknown[]) =>
          values.reduce<Decimal>(
            (a, v) => a.plus(String(v ?? 0)),
            new Decimal(0),
          );
        const money = (value: Decimal) =>
          value.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
        const groups = vehicles.flatMap((v) => {
          const m = manifests.filter((x) => x.placa === v.plate),
            e = entries.filter((x) => x.placa === v.plate),
            c = coupons.filter((x) => x.placa === v.plate);
          if (
            (!m.length && !e.length && !c.length) ||
            (dto.despesa && !e.some((x) => x.codigo_despesa === dto.despesa))
          )
            return [];
          const fretes = sum(m.map((x) => x.frete_veiculo)),
            creditos = sum(
              e.filter((x) => x.tipo_despesa === 'Credito').map((x) => x.valor),
            ),
            debitos = sum(
              e.filter((x) => x.tipo_despesa === 'Debito').map((x) => x.valor),
            ),
            cupons = sum(c.map((x) => x.valor));
          const bruto = fretes.plus(creditos),
            liquido = money(bruto.minus(debitos).minus(cupons));
          return [
            {
              semana: dto.semana ?? '',
              placa: v.plate,
              motorista:
                m.find((x) => x.motorista)?.motorista ??
                e.find((x) => x.motorista)?.motorista ??
                c.find((x) => x.motorista)?.motorista ??
                null,
              periodo_inicio: start,
              periodo_fim: end,
              manifests: m,
              entries: e,
              coupons: c,
              tipo_veiculo: v.codVehicleType,
              empresa: v.empresa_sigla ?? v.first_payer,
              totals: {
                fretes: money(fretes),
                creditos: money(creditos),
                debitos: money(debitos),
                cupons: money(cupons),
                total_bruto: money(bruto),
                total_liquido: liquido,
                total_ctrb: money(sum(m.map((x) => x.ctrb_total))),
              },
              payment: {
                criterio: m.some((x) => x.ctrb_numero) ? 'CTRB' : 'INTEGRAL',
                ctrbs: m.map((x) => x.ctrb_numero).filter(Boolean),
                primeira: {
                  empresa: v.empresa_sigla ?? v.first_payer,
                  valor: liquido,
                },
                segunda: { empresa: null, valor: new Decimal(0) },
              },
            },
          ];
        });
        groups.sort(
          (a, b) =>
            (dto.separar_pagamentos === 'true'
              ? (a.empresa ?? '').localeCompare(b.empresa ?? '')
              : 0) ||
            (dto.ordenar_tipo === 'true'
              ? a.tipo_veiculo - b.tipo_veiculo
              : 0) ||
            a.placa.localeCompare(b.placa),
        );
        return {
          groups,
          periodo_inicio: start,
          periodo_fim: end,
          filtros: dto,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
