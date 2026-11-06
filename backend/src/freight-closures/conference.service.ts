import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user.types';
import { hasGlobalFreightAccess } from '../auth/freight-access';
import { getWeek } from '../weeks/period-policy';
import { ConferenceDto } from './freight-closures.dto';
@Injectable()
export class ConferenceService {
  constructor(private readonly db: PrismaService) {}

  private unitWhere(user: AuthUser, unit?: number) {
    const targetUnit = hasGlobalFreightAccess(user) ? unit : user.unit;
    return targetUnit == null ? {} : { unit: targetUnit };
  }

  private async scopeWhere(tx: any, user: AuthUser, dto: { unit?: number; local?: string; dominio?: 'MLN' | 'LOOG' } = {}) {
    if (!hasGlobalFreightAccess(user)) return { unit: user.unit };
    if (dto.unit != null) return { unit: dto.unit };
    if (!dto.local && !dto.dominio) return {};
    const branches = await tx.branches.findMany({ where: { ...(dto.local ? { branch: dto.local } : {}), ...(dto.dominio ? { dominio: dto.dominio } : {}) }, select: { unit: true } });
    return { unit: { in: branches.map((branch: { unit: number }) => branch.unit) } };
  }

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
              where: { numero: Number(dto.numero), ...await this.scopeWhere(tx, user, dto) },
            })
          : null;
        if (dto.numero && !closure)
          throw new NotFoundException(
            'Fechamento não encontrado nesta unidade.',
          );
        const showClosed = dto.finalizados === 'true';
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
        const manifestScope = await this.scopeWhere(
          tx,
          user,
          closure ? { unit: closure.unit } : dto,
        );
        const unitInScope = (unit: number) => {
          const scoped = manifestScope.unit;
          if (scoped == null) return true;
          if (typeof scoped === 'number') return unit === scoped;
          return scoped.in.includes(unit);
        };
        let manifests = await tx.frete_carregamento_manifestos.findMany({
          where: {
            cancelado: false,
            ...manifestScope,
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
              : showClosed
                ? { fechamento_id: { not: null } }
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
        const manifestNumbers = manifests
          .flatMap((manifest) => [
            manifest.manifestos,
            manifest.manifesto_adicional_1,
            manifest.manifesto_adicional_2,
            manifest.manifesto_adicional_3,
          ])
          .filter((number): number is string => Boolean(number));
        const weekManifestReferences = closure || showClosed
          ? manifests
          : await tx.frete_carregamento_manifestos.findMany({
              where: {
                cancelado: false,
                ...manifestScope,
                placa: { in: plates },
                semana: dates,
              },
            });
        const priorityManifestIds = weekManifestReferences.map((manifest) => manifest.id);
        const priorityManifestNumbers = weekManifestReferences
          .flatMap((manifest) => [
            manifest.manifestos,
            manifest.manifesto_adicional_1,
            manifest.manifesto_adicional_2,
            manifest.manifesto_adicional_3,
          ])
          .filter((number): number is string => Boolean(number));
        let entries = await tx.frete_lancamentos.findMany({
          where: {
            placa: { in: plates },
            cancelado: false,
            ...(dto.usuario ? { responsavel_cod: Number(dto.usuario) } : {}),
            ...(closure
              ? { fechamento_id: closure.id }
              : showClosed
                ? { fechamento_id: { not: null } }
                : { fechamento_id: null, pago: false }),
            OR: [
              // Todo débito comum em aberto continua disponível nas semanas
              // seguintes até ser efetivamente selecionado no fechamento.
              {
                tipo_despesa: 'Debito',
                codigo_despesa: { not: '3333' },
              },
              // O 3333 acompanha exclusivamente o manifesto da semana atual.
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
                  // Crédito vinculado acompanha a semana do manifesto, mesmo
                  // quando foi lançado ou corrigido posteriormente.
                  { manifesto_id: { in: priorityManifestIds } },
                  {
                    manifesto_id: null,
                    manifesto_numero: { in: priorityManifestNumbers },
                  },
                  // Créditos avulsos e pagamentos extras continuam seguindo
                  // a data informada no próprio lançamento.
                  {
                    manifesto_id: null,
                    manifesto_numero: null,
                    data_lancamento: dates,
                  },
                ],
              },
            ],
          },
          orderBy: { numero: 'asc' },
        });
        const externalManifestIds = [
          ...new Set(
            entries
              .filter(
                (entry) =>
                  entry.manifesto_id != null &&
                  !priorityManifestIds.includes(entry.manifesto_id),
              )
              .map((entry) => entry.manifesto_id as number),
          ),
        ];
        const externalManifestNumbers = [
          ...new Set(
            entries
              .filter(
                (entry) =>
                  entry.manifesto_id == null &&
                  entry.manifesto_numero &&
                  !priorityManifestNumbers.includes(entry.manifesto_numero),
              )
              .map((entry) => entry.manifesto_numero as string),
          ),
        ];
        const linkedManifestUnits = new Map<number, number>(
          weekManifestReferences.map((manifest) => [manifest.id, manifest.unit]),
        );
        const linkedNumberUnits = new Map<string, number>();
        const linkedNumbers = new Map(
          weekManifestReferences.map((manifest) => [manifest.id, manifest.manifestos]),
        );
        for (const manifest of weekManifestReferences) {
          for (const number of [
            manifest.manifestos,
            manifest.manifesto_adicional_1,
            manifest.manifesto_adicional_2,
            manifest.manifesto_adicional_3,
          ]) {
            if (number) linkedNumberUnits.set(number, manifest.unit);
          }
        }
        if (externalManifestIds.length || externalManifestNumbers.length) {
          const linkedManifests = await tx.frete_carregamento_manifestos.findMany({
            where: {
              cancelado: false,
              OR: [
                ...(externalManifestIds.length
                  ? [{ id: { in: externalManifestIds } }]
                  : []),
                ...(externalManifestNumbers.length
                  ? [
                      { manifestos: { in: externalManifestNumbers } },
                      { manifesto_adicional_1: { in: externalManifestNumbers } },
                      { manifesto_adicional_2: { in: externalManifestNumbers } },
                      { manifesto_adicional_3: { in: externalManifestNumbers } },
                    ]
                  : []),
              ],
            },
            select: {
              id: true,
              unit: true,
              manifestos: true,
              manifesto_adicional_1: true,
              manifesto_adicional_2: true,
              manifesto_adicional_3: true,
            },
          });
          for (const manifest of linkedManifests) {
            linkedNumbers.set(manifest.id, manifest.manifestos);
            linkedManifestUnits.set(manifest.id, manifest.unit);
            for (const number of [
              manifest.manifestos,
              manifest.manifesto_adicional_1,
              manifest.manifesto_adicional_2,
              manifest.manifesto_adicional_3,
            ]) {
              if (number) linkedNumberUnits.set(number, manifest.unit);
            }
          }
        }
        entries = entries.map((entry) =>
          entry.manifesto_numero || entry.manifesto_id == null
            ? entry
            : {
                ...entry,
                manifesto_numero:
                  linkedNumbers.get(entry.manifesto_id) ?? null,
              },
        );
        entries = entries.filter((entry) => {
          if (
            entry.tipo_despesa === 'Debito' &&
            String(entry.codigo_despesa ?? '').trim() !== '3333'
          )
            return true;
          if (entry.manifesto_id != null) {
            if (ids.includes(entry.manifesto_id)) return true;
            const linkedUnit = linkedManifestUnits.get(entry.manifesto_id);
            return linkedUnit != null && unitInScope(linkedUnit);
          }
          if (entry.manifesto_numero) {
            if (manifestNumbers.includes(entry.manifesto_numero)) return true;
            const linkedUnit = linkedNumberUnits.get(entry.manifesto_numero);
            return linkedUnit != null && unitInScope(linkedUnit);
          }
          return (
            manifests.some((manifest) => manifest.placa === entry.placa) ||
            (entry.unit != null && unitInScope(entry.unit))
          );
        });
        const coupons =
          dto.mista === 'true'
            ? []
            : await tx.frete_cupons.findMany({
                where: {
                  placa: { in: plates },
                  ...(dto.usuario
                    ? { responsavel_cod: Number(dto.usuario) }
                    : {}),
                  ...(closure
                    ? { fechamento_id: closure.id }
                    : showClosed
                      ? { fechamento_id: { not: null }, data_cobranca: dates }
                      : { fechamento_id: null, pago: false }),
                },
                include: {
                  nota: { select: { codigo_tipo: true, nome_tipo: true } },
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
            (!m.length &&
              !e.some((x) =>
                ['Credito', 'Adiantamento'].includes(x.tipo_despesa),
              )) ||
            (dto.despesa && !e.some((x) => x.codigo_despesa === dto.despesa))
          )
            return [];
          const fretes = sum(m.map((x) => x.frete_veiculo)),
            creditos = sum(
              e.filter((x) => x.tipo_despesa === 'Credito').map((x) => x.valor),
            ),
            debitos = sum(
              e.filter(
                (x) =>
                  x.tipo_despesa === 'Debito' &&
                  String(x.codigo_despesa ?? '').trim() !== '3333',
              ).map((x) => x.valor),
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
              origem:
                [...new Set(m.map((x) => x.origem).filter(Boolean))].join(
                  ' / ',
                ) || null,
              closureNumber:
                m.find((x) => x.num_fechamento != null)?.num_fechamento ??
                closure?.numero ??
                null,
              isClosed:
                !!closure ||
                m.some((manifest) => manifest.fechamento_id != null),
              periodo_inicio: start,
              periodo_fim: end,
              manifests: m,
              entries: e,
              coupons: c,
              tipo_veiculo: v.codVehicleType,
              tipoVeiculo:
                m.find((row) => row.tipo_veiculo)?.tipo_veiculo ??
                e.find((row) => row.tipo_veiculo)?.tipo_veiculo ??
                c.find((row) => row.tipo_veiculo)?.tipo_veiculo ??
                null,
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
