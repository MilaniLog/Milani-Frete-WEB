import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { AuthUser } from '../auth/auth-user.types';
import { getWeek } from '../weeks/period-policy';
import {
  savedReport,
  renderClosureReport,
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
    const targetUnit = user.isAdmin ? unit : user.unit;
    return targetUnit == null ? {} : { unit: targetUnit };
  }

  private unitLabel(user: AuthUser) {
    return user.isAdmin ? 'Todas as unidades' : `Unidade ${user.unit}`;
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
  financial(q: ReportQuery, user: AuthUser): Promise<TableReport> {
    return this.db.$transaction(
      async (tx) => {
        if (q.lancamentos === 'false' && q.cupons === 'false')
          throw new BadRequestException('Selecione lançamentos ou cupons.');
        const p = await this.period(tx, q),
          inclusion = q.data_por === 'inclusao';
        const range = {
          gte: p.start,
          lt: new Date(p.end.getTime() + 86400000),
        };
        const scope = {
          ...this.unitWhere(user),
          ...(q.placa ? { placa: q.placa } : {}),
          ...(q.departamento ? { departamento: q.departamento } : {}),
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
                  [inclusion ? 'created_at' : 'data_lancamento']: range,
                },
                orderBy: { numero: 'asc' },
              });
        const coupons =
          q.cupons === 'false'
            ? []
            : await tx.frete_cupons.findMany({
                where: {
                  ...scope,
                  [inclusion ? 'created_at' : 'data_cobranca']: range,
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
            ...this.unitWhere(user),
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
            origin: 'Lançamento',
            num: e.numero,
            date: inclusion ? e.created_at : e.data_lancamento,
            plate: e.placa,
            driver: e.motorista,
            document:
              e.manifesto_id == null
                ? 'Avulso'
                : (numbers.get(e.manifesto_id) ?? 'Não registrado'),
            code: e.codigo_despesa,
            name: e.nome_despesa,
            description: e.descricao,
            type: e.tipo_despesa,
            value: e.valor,
            department: e.departamento,
            paid: e.pago || e.fechamento_id != null,
          })),
          ...coupons.map((c) => ({
            origin: 'Cupom',
            num: c.id,
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
            paid: c.pago || c.fechamento_id != null,
          })),
        ];
        records.sort(
          (a, b) =>
            a.code.localeCompare(b.code) ||
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
            r.paid ? 'Pago / fechado' : 'Em aberto',
          ];
        });
        return {
          financialKind: q.lancamentos === 'false' ? 'coupons' : q.cupons === 'false' ? 'entries' : 'combined',
          title: q.lancamentos === 'false' ? 'Conferência de cupons' : q.cupons === 'false' ? 'Conferência de lançamentos' : 'Conferência de lançamentos e cupons',
          notes: [
            `${this.unitLabel(user)} · ${date(p.start)} a ${date(p.end)}${q.semana ? ` · Semana ${q.semana}` : ''}`,
            `Data: ${inclusion ? 'inclusão no site' : 'despesa/cobrança'} · Situação: ${q.situacao ?? 'abertos'}${q.placa ? ` · Placa ${q.placa}` : ''}${q.departamento ? ` · Departamento ${q.departamento}` : ''}${q.usuario ? ` · Usuário ${q.usuario}` : ''}`,
          ],
          columns: [
            'Origem',
            q.lancamentos === 'false' ? 'Cupom' : 'Lanç',
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
            { label: 'Adiantamentos (informativo)', value: money(advances) },
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
    const closures = await tx.frete_fechamentos.findMany({
      where: {
        ...this.unitWhere(user),
        ...(onlyClosed ? { status: 'FECHADO' } : {}),
        ...(q.numero ? { numero: Number(q.numero) } : {}),
        ...(q.placa ? { placa: q.placa } : {}),
        ...(q.semana
          ? { semana: q.semana }
          : p
            ? { periodo_inicio: { lte: p.end }, periodo_fim: { gte: p.start } }
            : {}),
      },
      orderBy: [{ numero: 'asc' }, { id: 'asc' }],
    });
    if (q.numero && !closures.length)
      throw new NotFoundException('Fechamento não encontrado nesta unidade.');
    const reports = [] as {
      closure: (typeof closures)[number];
      report: ReturnType<typeof savedReport>;
    }[];
    for (const closure of closures) {
      const h = closure.historico as any;
      const where = { unit: closure.unit, fechamento_id: closure.id };
      const detail =
        h?.finalizacao?.dados || h?.cancelamento?.dados
          ? { closure, manifests: [], entries: [], coupons: [] }
          : {
              closure,
              manifests: await tx.frete_carregamento_manifestos.findMany({
                where,
              }),
              entries: await tx.frete_lancamentos.findMany({ where }),
              coupons: await tx.frete_cupons.findMany({ where }),
            };
      reports.push({ closure, report: savedReport(detail) });
    }
    return { reports, period: p };
  }
  reprint(q: ReportQuery, user: AuthUser) {
    return this.db.$transaction(
      async (tx) => {
        const data = await this.closures(tx, q, user, false);
        return combineHtml(
          data.reports.map((r) => renderClosureReport(r.report)),
        );
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
  }
  payments(q: ReportQuery, user: AuthUser): Promise<TableReport> {
    return this.db.$transaction(
      async (tx) => {
        const data = await this.closures(tx, q, user, true);
        const vehicles = await tx.vehicle.findMany({
          where: { plate: { in: data.reports.map((r) => r.closure.placa) } },
          select: {
            plate: true,
            owner: true,
            owner_name: true,
            empresa_sigla: true,
            first_payer: true,
          },
        });
        const byPlate = new Map(vehicles.map((v) => [v.plate, v]));
        const rows: Cell[][] = [];
        let legacy = 0,
          currentOwner = 0;
        for (const { closure, report: r } of data.reports) {
          const v = byPlate.get(closure.placa),
            h = closure.historico as any,
            owner = h?.finalizacao?.dados?.beneficiario;
          const company = r.payment?.primeira
            ? (r.payment.primeira.empresa ?? null)
            : (v?.empresa_sigla ?? v?.first_payer ?? null);
          if (q.empresa && company !== q.empresa) continue;
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
          rows.push([
            company,
            owner ? (owner.documento ?? null) : (v?.owner ?? null),
            owner ? (owner.nome ?? null) : (v?.owner_name ?? null),
            closure.semana,
            String(closure.numero),
            closure.placa,
            money(gross),
            money(ctrb),
            money(gross.minus(ctrb)),
            money(gross.minus(net)),
            money(net.minus(ctrb)),
            String(closure.unit),
            ctrbNet,
          ]);
        }
        rows.sort(
          (a, b) =>
            String(a[0] ?? '').localeCompare(String(b[0] ?? '')) ||
            String(a[5]).localeCompare(String(b[5])) ||
            Number(a[4]) - Number(b[4]),
        );
        const numeric = [6, 7, 8, 9, 10, 12],
          columns = [
            'EMPR',
            'CPF/CNPJ PROP',
            'NOME PROP',
            'SEM',
            'FECH',
            'PLACA',
            'TTL FRETE',
            'CTRB BRT',
            'LIQ S/ CTRB',
            'VALES',
            'LIQ PAGAR',
            'UN',
            'CTRB LIQ',
          ];
        const totals = numeric.map((i) => ({
          label: `Total ${columns[i]}${rows.some((r) => r[i] == null) ? ' (somente valores registrados)' : ''}`,
          value: money(
            rows.reduce((a, r) => a.plus(String(r[i] ?? 0)), new Decimal(0)),
          ),
        }));
        return {
          title: 'Planilha de pagamentos',
          columns,
          rows,
          numeric,
          totals,
          notes: [
            `${this.unitLabel(user)}${q.semana ? ` · Semana ${q.semana}` : ''}${data.period ? ` · ${date(data.period.start)} a ${date(data.period.end)}` : ''}${q.placa ? ` · Placa ${q.placa}` : ''}${q.empresa ? ` · Empresa ${q.empresa}` : ''}`,
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
