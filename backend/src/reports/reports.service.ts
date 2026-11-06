import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { AuthUser } from '../auth/auth-user.types';
import { hasGlobalFreightAccess } from '../auth/freight-access';
import { getWeek } from '../weeks/period-policy';
import {
  savedReport,
  renderClosureReport,
  renderDriverClosureReport,
} from '../freight-closures/closure-report';
import { ReportQuery } from './reports.dto';
import { combineHtml, type TableReport, type Cell } from './report-render';
const money = (v: unknown) =>
  new Decimal(String(v ?? 0)).toFixed(2, Decimal.ROUND_HALF_EVEN);
const date = (v: unknown) =>
  (v instanceof Date ? v.toISOString() : String(v ?? ''))
    .slice(0, 10)
    .split('-')
    .reverse()
    .join('/');
@Injectable()
export class ReportsService {
  constructor(private readonly db: PrismaService) {}

  private unitWhere(user: AuthUser, unit?: number) {
    const targetUnit = hasGlobalFreightAccess(user) ? unit : user.unit;
    return targetUnit == null ? {} : { unit: targetUnit };
  }

  private async scopeWhere(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    q: Pick<ReportQuery, 'unit' | 'local' | 'dominio'>,
  ) {
    if (!hasGlobalFreightAccess(user)) return { unit: user.unit };
    if (q.unit != null) return { unit: q.unit };
    if (!q.local && !q.dominio) return {};
    const branches = await tx.branches.findMany({
      where: {
        ...(q.local ? { branch: q.local } : {}),
        ...(q.dominio ? { dominio: q.dominio } : {}),
      },
      select: { unit: true },
    });
    return { unit: { in: branches.map((branch) => branch.unit) } };
  }

  private unitLabel(
    user: AuthUser,
    q?: Pick<ReportQuery, 'unit' | 'local' | 'dominio'>,
  ) {
    if (!hasGlobalFreightAccess(user)) return `Unidade ${user.unit}`;
    if (q?.local) return `Unidade ${q.local}`;
    if (q?.unit != null) return `Unidade ${q.unit}`;
    if (q?.dominio) return `Domínio ${q.dominio}`;
    return 'Todas as unidades';
  }

  private async period(tx: Prisma.TransactionClient, q: ReportQuery) {
    if (q.semana && (q.inicio || q.fim))
      throw new BadRequestException('Escolha semana ou início e fim.');
    if (q.semana) {
      const w = await getWeek(tx, q.semana);
      return { start: w.data_inicio, end: w.data_fim };
    }
    if (!q.inicio || !q.fim)
      throw new BadRequestException('Informe uma semana ou início e fim.');
    const start = new Date(`${q.inicio}T00:00:00Z`),
      end = new Date(`${q.fim}T00:00:00Z`);
    if (start > end)
      throw new BadRequestException('Início deve ser anterior ao fim.');
    return { start, end };
  }

  manifests(q: ReportQuery, user: AuthUser): Promise<TableReport> {
    return this.db.$transaction(async (tx) => {
      const { start, end } = await this.period(tx, q);
      const unitScope = q.unit != null
        ? { unit: q.unit }
        : q.local || q.dominio
          ? {
              unit: {
                in: (
                  await tx.branches.findMany({
                    where: {
                      ...(q.local ? { branch: q.local } : {}),
                      ...(q.dominio ? { dominio: q.dominio } : {}),
                    },
                    select: { unit: true },
                  })
                ).map((branch) => branch.unit),
              },
            }
          : {};
      const manifests = await tx.frete_carregamento_manifestos.findMany({
        where: {
          cancelado: false,
          ...unitScope,
          semana: { gte: start, lte: end },
          num_fechamento: { not: null },
        },
        orderBy: [{ placa: 'asc' }, { num_fechamento: 'asc' }],
        select: {
          placa: true,
          num_fechamento: true,
        },
      });
      const rows = [
        ...new Map(
          manifests.map((row) => [
            `${row.placa}\u0000${row.num_fechamento}`,
            row,
          ]),
        ).values(),
      ];
      return {
        title: 'Números de fechamento',
        printLayout: 'compact-pairs' as const,
        notes: [
          `Período: ${date(start)} a ${date(end)}`,
          q.local
            ? `Unidade ${q.local}`
            : q.unit != null
              ? `Unidade ${q.unit}`
              : q.dominio
                ? `Domínio ${q.dominio}`
                : 'Todas as unidades',
          `Total: ${rows.length}`,
          'Ordenado por placa.',
        ],
        columns: ['Placa', 'Nº fechamento'],
        rows: rows.map((row) => [row.placa, String(row.num_fechamento)]),
        totals: [],
        numeric: [],
      };
    });
  }

  reportUnits() {
    return this.db.branches.findMany({
      orderBy: [{ branch: 'asc' }, { unit: 'asc' }],
      select: { unit: true, branch: true, dominio: true },
    });
  }

  financial(q: ReportQuery, user: AuthUser): Promise<TableReport> {
    return this.db.$transaction(
      async (tx) => {
        if (q.lancamentos === 'false' && q.cupons === 'false')
          throw new BadRequestException('Selecione vales ou cupons.');
        const allEntriesByPlate = Boolean(
          q.placa &&
            !q.semana &&
            !q.inicio &&
            !q.fim &&
            q.lancamentos !== 'false' &&
            q.cupons === 'false',
        );
        const p = allEntriesByPlate ? null : await this.period(tx, q),
          inclusion = q.data_por === 'inclusao';
        const range = p
          ? {
              gte: p.start,
              lt: new Date(p.end.getTime() + 86400000),
            }
          : null;
        const scope = {
          ...(await this.scopeWhere(tx, user, q)),
          ...(q.placa ? { placa: q.placa } : {}),
          ...(q.departamento
            ? { departamento: { startsWith: q.departamento } }
            : {}),
          ...(q.usuario ? { responsavel_cod: Number(q.usuario) } : {}),
          ...(q.situacao === 'todos'
            ? {}
            : q.situacao === 'pagos'
              ? { OR: [{ pago: true }, { fechamento_id: { not: null } }] }
              : { pago: false, fechamento_id: null }),
        };
        const entries =
          q.lancamentos === 'false'
            ? []
            : await tx.frete_lancamentos.findMany({
                where: {
                  ...scope,
                  cancelado: false,
                  ...(q.movimento === 'credito'
                    ? { tipo_despesa: 'Credito' }
                    : q.movimento === 'debito'
                      ? { tipo_despesa: { in: ['Debito', 'Adiantamento'] } }
                      : {}),
                  ...(q.tipo ? { codigo_despesa: q.tipo } : {}),
                  ...(range
                    ? {
                        [inclusion ? 'created_at' : 'data_lancamento']: range,
                      }
                    : {}),
                },
                orderBy: { id: 'asc' },
              });
        const coupons =
          q.cupons === 'false'
            ? []
            : await tx.frete_cupons.findMany({
                where: {
                  ...scope,
                  ...(q.movimento === 'credito' ? { id: -1 } : {}),
                  ...(q.tipo ? { nota: { codigo_tipo: q.tipo } } : {}),
                  ...(range
                    ? {
                        [inclusion ? 'created_at' : 'data_cobranca']: range,
                      }
                    : {}),
                },
                include: {
                  nota: {
                    select: {
                      numero: true,
                      codigo_tipo: true,
                      nome_tipo: true,
                    },
                  },
                },
                orderBy: { id: 'asc' },
              });
        const manifests = await tx.frete_carregamento_manifestos.findMany({
          where: {
            cancelado: false,
            ...(await this.scopeWhere(tx, user, q)),
            id: {
              in: entries.flatMap((e) =>
                e.manifesto_id == null ? [] : [e.manifesto_id],
              ),
            },
          },
          select: {
            id: true,
            manifestos: true,
            manifesto_adicional_1: true,
            manifesto_adicional_2: true,
            manifesto_adicional_3: true,
          },
        });
        const manifestLabel = (m: (typeof manifests)[number]) =>
          [
            m.manifestos,
            m.manifesto_adicional_1,
            m.manifesto_adicional_2,
            m.manifesto_adicional_3,
          ]
            .filter(Boolean)
            .join(' / ');
        const numbers = new Map(manifests.map((m) => [m.id, manifestLabel(m)]));
        const records = [
          ...entries.map((e) => ({
            origin: 'Vale',
            num: e.controle_id ?? e.id,
            date: inclusion ? e.created_at : e.data_lancamento,
            plate: e.placa,
            driver: e.motorista,
            document:
              e.manifesto_id == null
                ? (e.manifesto_numero ?? 'Avulso')
                : (numbers.get(e.manifesto_id) ?? ''),
            code: e.codigo_despesa,
            name: e.codigo_despesa.trim() === '3333' ? 'CTRB' : e.nome_despesa,
            description: e.descricao,
            type: e.codigo_despesa.trim() === '3333' ? 'CTRB' : e.tipo_despesa,
            value: e.valor,
            department: e.departamento,
            userCode: e.responsavel_cod,
            invoiceNumber: e.numero_fatura,
            paid: e.pago || e.fechamento_id != null,
          })),
          ...coupons.map((c) => ({
            origin: 'Cupom',
            num: c.controle_id ?? c.id,
            date: inclusion ? c.created_at : c.data_cobranca,
            plate: c.placa,
            driver: c.motorista,
            document: c.nota.numero,
            code: c.nota.codigo_tipo,
            name: c.nota.nome_tipo,
            description: c.descricao,
            type: 'Debito',
            value: c.valor,
            department: c.departamento,
            userCode: c.responsavel_cod,
            invoiceNumber: null,
            paid: c.pago || c.fechamento_id != null,
          })),
        ];
        records.sort((a, b) =>
          q.lancamentos !== 'false' && q.cupons === 'false'
            ? a.plate.localeCompare(b.plate) ||
              a.date.getTime() - b.date.getTime() ||
              a.num - b.num
            : a.code.localeCompare(b.code) ||
              a.date.getTime() - b.date.getTime() ||
              a.num - b.num,
        );
        const totals = new Map<string, Decimal>();
        let credits = new Decimal(0),
          debits = new Decimal(0),
          advances = new Decimal(0);
        const rows: Cell[][] = records.map((r) => {
          const v = new Decimal(r.value);
          if (r.type === 'Credito') credits = credits.plus(v);
          else if (r.type === 'Debito') debits = debits.plus(v);
          else advances = advances.plus(v);
          const signed = r.type === 'Debito' ? v.negated() : v;
          const key = `${r.origin} ${r.code} — ${r.name}`;
          totals.set(key, (totals.get(key) ?? new Decimal(0)).plus(signed));
          return [
            r.origin,
            r.num,
            date(r.date),
            r.plate,
            r.driver,
            r.document,
            r.code,
            r.name,
            r.description,
            r.type,
            money(signed),
            r.department,
            r.userCode,
            r.invoiceNumber == null
              ? null
              : String(r.invoiceNumber).padStart(6, '0'),
            r.paid ? 'Pago / fechado' : 'Em aberto',
          ];
        });
        const reportPlates = [...new Set(records.map((record) => record.plate).filter(Boolean))];
        const reportVehicles = reportPlates.length
          ? await tx.vehicle.findMany({
              where: { plate: { in: reportPlates } },
              select: { plate: true, codVehicleType: true },
            })
          : [];
        const reportVehicleTypes = reportVehicles.length
          ? await tx.vehicleType.findMany({
              where: {
                codVehicleType: {
                  in: [...new Set(reportVehicles.map((vehicle) => vehicle.codVehicleType))],
                },
              },
              select: { codVehicleType: true, typeName: true },
            })
          : [];
        const typeByCode = new Map(
          reportVehicleTypes.map((type) => [type.codVehicleType, type.typeName]),
        );
        const vehicleTypeByPlate = new Map(
          reportVehicles.map((vehicle) => [
            vehicle.plate,
            typeByCode.get(vehicle.codVehicleType) ?? null,
          ]),
        );
        return {
          financialKind: q.lancamentos === 'false' ? 'coupons' : q.cupons === 'false' ? 'entries' : 'combined',
          plateDetails: Object.fromEntries(
            reportPlates.map((plate) => [
              plate,
              {
                driver: records.find((record) => record.plate === plate && record.driver)?.driver ?? null,
                vehicleType: vehicleTypeByPlate.get(plate) ?? null,
              },
            ]),
          ),
          title: q.lancamentos === 'false' ? 'Conferência de cupons' : q.cupons === 'false' ? 'Conferência de vales' : 'Conferência de vales e cupons',
          notes: [
            p
              ? `${this.unitLabel(user, q)} · ${date(p.start)} a ${date(p.end)}${q.semana ? ` · Semana ${q.semana}` : ''}`
              : `${this.unitLabel(user, q)} · Todos os vales da placa ${q.placa}`,
            `Data: ${inclusion ? 'inclusão no site' : 'despesa/cobrança'} · Situação: ${q.situacao ?? 'abertos'} · Movimento: ${q.movimento ?? 'todos'}${q.tipo ? ` · Tipo ${q.tipo}` : ''}${q.placa ? ` · Placa ${q.placa}` : ''}${q.departamento ? ` · Departamento ${q.departamento}` : ''}${q.usuario ? ` · Usuário ${q.usuario}` : ''}`,
          ],
          columns: [
            'Origem',
            q.lancamentos === 'false'
              ? 'Cupom'
              : q.cupons === 'false'
                ? 'ID Vale'
                : 'ID Vale/Cupom',
            'Data',
            'Placa',
            'Motorista',
            q.lancamentos === 'false' ? 'Nota' : 'Manif/NF',
            'Código',
            'Tipo',
            'Descrição',
            'D/C',
            'Valor',
            'Departamento',
            'Usuário',
            'Nº Fech. Vale',
            'Situação',
          ],
          rows,
          numeric: [10],
          totals: [
            ...Array.from(totals, ([label, value]) => ({
              label,
              value: money(value),
            })),
            { label: 'Créditos', value: money(credits) },
            { label: q.lancamentos === 'false' ? 'Cupons' : q.cupons === 'false' ? 'Débitos' : 'Débitos e cupons', value: money(debits) },
            { label: 'CTRB (informativo)', value: money(advances) },
            {
              label: q.lancamentos === 'false' ? 'Total de cupons (débito)' : q.cupons === 'false' ? 'Créditos menos débitos' : 'Créditos menos débitos e cupons',
              value: money(credits.minus(debits)),
            },
          ],
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
  }
  private async closures(
    tx: Prisma.TransactionClient,
    q: ReportQuery,
    user: AuthUser,
    onlyClosed: boolean,
  ) {
    const p =
      q.numero && !q.semana && !q.inicio && !q.fim
        ? null
        : await this.period(tx, q);
    const categoryPlates =
      q.categoria && q.categoria !== 'Todos'
        ? await tx.vehicle.findMany({
            where: {
              ...(q.placa ? { plate: q.placa } : {}),
              codVehicleType:
                q.categoria === 'Agregado' ? { lt: 100 } : { gte: 100 },
            },
            select: { plate: true },
          })
        : null;
    const closures = await tx.frete_fechamentos.findMany({
      where: {
        ...(await this.scopeWhere(tx, user, q)),
        ...(onlyClosed ? { status: 'FECHADO' } : {}),
        ...(q.numero ? { numero: Number(q.numero) } : {}),
        ...(categoryPlates
          ? { placa: { in: categoryPlates.map((vehicle) => vehicle.plate) } }
          : q.placa
            ? { placa: q.placa }
            : {}),
        ...(q.semana
          ? { semana: q.semana }
          : p
            ? { periodo_inicio: { lte: p.end }, periodo_fim: { gte: p.start } }
            : {}),
      },
      orderBy: [{ placa: 'asc' }, { numero: 'asc' }, { id: 'asc' }],
    });
    if (q.numero && !closures.length)
      throw new NotFoundException('Fechamento não encontrado nesta unidade.');
    const reports = [] as {
      closure: (typeof closures)[number];
      report: ReturnType<typeof savedReport>;
    }[];
    for (const closure of closures) {
      const history = closure.historico as any;
      const historicalData =
        history?.finalizacao?.dados ?? history?.cancelamento?.dados;
      const where = { unit: closure.unit, fechamento_id: closure.id };
      const detail = historicalData
        ? {
            closure,
            manifests: [],
            entries: await tx.frete_lancamentos.findMany({
              where: {
                id: {
                  in: Array.isArray(historicalData.entries)
                    ? historicalData.entries.map((row: any) => row.id)
                    : [],
                },
              },
            }),
            coupons: await tx.frete_cupons.findMany({
              where: {
                id: {
                  in: Array.isArray(historicalData.coupons)
                    ? historicalData.coupons.map((row: any) => row.id)
                    : [],
                },
              },
            }),
          }
        : {
            closure,
            manifests: await tx.frete_carregamento_manifestos.findMany({ where }),
            entries: await tx.frete_lancamentos.findMany({
              where: { ...where, cancelado: false },
            }),
            coupons: await tx.frete_cupons.findMany({ where }),
          };
      reports.push({ closure, report: savedReport(detail) });
    }
    return { reports, period: p };
  }
  reprint(q: ReportQuery, user: AuthUser) {
    return this.db.$transaction(
      async (tx) => {
        const data = await this.closures(tx, q, user, true);
        return combineHtml(
          data.reports.map((r) => renderClosureReport(r.report)),
        );
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
  }
  reprintDrivers(q: ReportQuery, user: AuthUser) {
    return this.db.$transaction(
      async (tx) => {
        const data = await this.closures(tx, q, user, true);
        return combineHtml(
          data.reports.map((r) => renderDriverClosureReport(r.report)),
        );
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
  }
  payments(q: ReportQuery, user: AuthUser): Promise<TableReport> {
    return this.db.$transaction(
      async (tx) => {
        const data = await this.closures(tx, q, user, true);
        const [vehicles, branches] = await Promise.all([
          tx.vehicle.findMany({
            where: { plate: { in: data.reports.map((r) => r.closure.placa) } },
            select: {
              plate: true,
              owner: true,
              owner_name: true,
              empresa_sigla: true,
            },
          }),
          tx.branches.findMany({
            where: {
              unit: { in: [...new Set(data.reports.map((r) => r.closure.unit))] },
            },
            select: { unit: true, branch: true, dominio: true },
          }),
        ]);
        const byPlate = new Map(vehicles.map((v) => [v.plate, v]));
        const branchByUnit = new Map(branches.map((branch) => [branch.unit, branch]));
        const detailRows: Cell[][] = [];
        let legacy = 0,
          currentOwner = 0;
        for (const { closure, report: r } of data.reports) {
          const v = byPlate.get(closure.placa),
            branch = branchByUnit.get(closure.unit),
            h = closure.historico as any,
            owner = h?.finalizacao?.dados?.beneficiario;
          if (r.origem !== 'FINALIZACAO') legacy++;
          if (!owner) currentOwner++;
          const gross = new Decimal(
              r.totals.total_bruto ?? closure.total_bruto,
            ),
            net = new Decimal(r.totals.total_liquido ?? closure.total_liquido);
          // ReportPaymentFreights: CTRB is deducted here, not in the stored closure balance.
          const eligible = r.manifests.filter(
            (m) => !new Decimal(String(m.frete_veiculo ?? 0)).isZero(),
          );
          const ctrb =
            r.origem === 'FINALIZACAO'
              ? eligible.reduce(
                  (a, m) => a.plus(String(m.ctrb_total ?? 0)),
                  new Decimal(0),
                )
              : new Decimal(closure.total_ctrb);
          const ctrb3333 = r.entries
            .filter(
              (entry) => String(entry.codigo_despesa ?? '').trim() === '3333',
            )
            .reduce(
              (total, entry) => total.plus(String(entry.valor ?? 0)),
              new Decimal(0),
            );
          const ctrbNet =
            r.origem === 'FINALIZACAO' &&
            eligible.every((m) => m.valor_liquido != null)
              ? money(
                  eligible.reduce(
                    (a, m) => a.plus(String(m.valor_liquido)),
                    new Decimal(0),
                  ),
                )
              : null;
          const company =
            r.payment?.primeira?.empresa?.trim() ||
            v?.empresa_sigla?.trim() ||
            'SEM EMPRESA';
          detailRows.push([
            company,
            owner ? (owner.documento ?? null) : (v?.owner ?? null),
            owner ? (owner.nome ?? null) : (v?.owner_name ?? null),
            closure.semana,
            String(closure.numero),
            closure.placa,
            money(gross),
            money(ctrb),
            money(ctrb3333),
            money(gross.minus(ctrb)),
            money(gross.minus(net)),
            money(net.minus(ctrb)),
            String(closure.unit),
            branch?.dominio ?? null,
            branch?.branch ?? null,
            ctrbNet,
          ]);
        }
        detailRows.sort(
          (a, b) =>
            String(a[0]).localeCompare(String(b[0]), 'pt-BR', {
              sensitivity: 'base',
            }) ||
            String(a[5]).localeCompare(String(b[5])) ||
            Number(a[4]) - Number(b[4]),
        );
        const numeric = [6, 7, 8, 9, 10, 11, 15],
          columns = [
            'EMPRESA',
            'CPF/CNPJ PROP',
            'NOME PROP',
            'SEM',
            'FECH',
            'PLACA',
            'TTL FRETE',
            'CTRB BRT',
            'CTRB PAGO',
            'LIQ S/ CTRB',
            'VALES',
            'LIQ PAGAR',
            'CÓD. UN',
            'DOMÍNIO',
            'UNIDADE',
            'CTRB LIQ',
          ];
        const rows: Cell[][] = [];
        const subtotalRows: number[] = [];
        for (const company of [...new Set(detailRows.map((row) => String(row[0])))]) {
          const companyRows = detailRows.filter((row) => row[0] === company);
          rows.push(...companyRows);
          const subtotal: Cell[] = Array(columns.length).fill(null);
          subtotal[0] = company;
          subtotal[2] = `SUBTOTAL ${company}`;
          for (const index of numeric) {
            subtotal[index] = money(
              companyRows.reduce(
                (sum, row) => sum.plus(String(row[index] ?? 0)),
                new Decimal(0),
              ),
            );
          }
          subtotalRows.push(rows.length);
          rows.push(subtotal);
        }
        const total = (index: number) =>
          detailRows.reduce(
            (sum, row) => sum.plus(String(row[index] ?? 0)),
            new Decimal(0),
          );
        const totalTtlFrete = total(6);
        const totalCtrbBruto = total(7);
        const totalCtrbPago = total(8);
        const totalLiquidoSemCtrb = total(9);
        const totalVales = total(10);
        const totalLiquidoPagar = total(11);
        const totalCtrbLiquido = total(15);
        const totalCtrbPagar = totalCtrbLiquido.minus(totalCtrbPago);
        const totalPagar = totalLiquidoPagar.plus(totalCtrbPagar);
        const totalSections = [
          {
            title: 'Totais do frete',
            totals: [
              { label: 'Total TTL frete', value: money(totalTtlFrete) },
              { label: 'Total líquido sem CTRB', value: money(totalLiquidoSemCtrb) },
              { label: 'Total vales', value: money(totalVales) },
              { label: 'Total líquido a pagar', value: money(totalLiquidoPagar) },
            ],
          },
          {
            title: 'Totais do CTRB',
            totals: [
              { label: 'Total CTRB bruto', value: money(totalCtrbBruto) },
              { label: 'Total CTRB líquido', value: money(totalCtrbLiquido) },
              { label: 'Total CTRB pago', value: money(totalCtrbPago) },
              { label: 'Total CTRB a pagar', value: money(totalCtrbPagar) },
            ],
          },
          {
            title: 'Total final',
            totals: [
              { label: 'Total líquido a pagar', value: money(totalLiquidoPagar) },
              { label: 'Total CTRB a pagar', value: money(totalCtrbPagar) },
              { label: 'Total a pagar', value: money(totalPagar) },
            ],
          },
        ];
        const totals = totalSections.flatMap((section) => section.totals);
        return {
          title: 'Planilha de pagamentos',
          columns,
          rows,
          numeric,
          subtotalRows,
          totals,
          totalSections,
          notes: [
            `${this.unitLabel(user, q)}${q.semana ? ` · Semana ${q.semana}` : ''}${data.period ? ` · ${date(data.period.start)} a ${date(data.period.end)}` : ''}${q.placa ? ` · Placa ${q.placa}` : ''}${q.dominio ? ` · Domínio ${q.dominio}` : ''}`,
            'Somente fechamentos finalizados. LIQ PAGAR = líquido do fechamento − CTRB bruto, conforme a planilha VBA. Nenhum pagamento é executado; não há rateio percentual.',
            ...(legacy
              ? [
                  `${legacy} fechamento(s) legado(s) sem cópia original: totais gravados utilizados; CTRB líquido não registrado.`,
                ]
              : []),
            ...(currentOwner
              ? [
                  `${currentOwner} fechamento(s) sem identificação histórica do proprietário: cadastro atual exibido. Empresa histórica preservada quando registrada.`,
                ]
              : []),
          ],
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
  }
}
