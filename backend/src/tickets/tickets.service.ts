import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustTicketPendingDto, TicketQueryDto } from './tickets.dto';

type RawRow = Record<string, unknown>;

@Injectable()
export class TicketsService {
  constructor(private readonly db: PrismaService) {}

  private async allowedUnits(user: AuthUser): Promise<number[] | null> {
    if (user.isAdmin) return null;
    return [user.unit];
  }

  private unitClause(
    requested: number | undefined,
    allowed: number[] | null,
    values: unknown[],
    alias = 't',
  ) {
    if (requested != null) {
      if (allowed && !allowed.includes(requested))
        throw new ForbiddenException('Unidade não autorizada para este usuário.');
      values.push(requested);
      return ` AND ${alias}.unit = ?`;
    }
    if (!allowed) return '';
    values.push(...allowed);
    return ` AND ${alias}.unit IN (${allowed.map(() => '?').join(',')})`;
  }

  async options(user: AuthUser) {
    const allowed = await this.allowedUnits(user);
    const values: unknown[] = [];
    const unitFilter = this.unitClause(undefined, allowed, values);
    const units = await this.db.$queryRawUnsafe<RawRow[]>(
      `SELECT DISTINCT t.unit, COALESCE(b.branch, CAST(t.unit AS CHAR)) AS branch
       FROM tickets t LEFT JOIN branches b ON b.unit = t.unit
       WHERE t.unit IS NOT NULL${unitFilter}
       ORDER BY branch, t.unit`,
      ...values,
    );
    const typeValues: unknown[] = [];
    const typeUnitFilter = this.unitClause(undefined, allowed, typeValues);
    const types = await this.db.$queryRawUnsafe<RawRow[]>(
      `SELECT DISTINCT t.type FROM tickets t
       WHERE t.type IS NOT NULL AND TRIM(t.type) <> ''${typeUnitFilter}
       ORDER BY t.type`,
      ...typeValues,
    );
    const statusValues: unknown[] = [];
    const statusUnitFilter = this.unitClause(undefined, allowed, statusValues);
    const statuses = await this.db.$queryRawUnsafe<RawRow[]>(
      `SELECT DISTINCT i.status_ticket
       FROM invoices i JOIN tickets t ON t.id = i.ticket_id
       WHERE i.status_ticket IS NOT NULL AND TRIM(i.status_ticket) <> ''${statusUnitFilter}
       ORDER BY i.status_ticket`,
      ...statusValues,
    );
    return {
      units: units.map((row) => ({ unit: Number(row.unit), branch: row.branch })),
      types: types.map((row) => String(row.type)),
      statuses: statuses.map((row) => String(row.status_ticket)),
    };
  }

  async pending(user: AuthUser) {
    const allowed = await this.allowedUnits(user);
    const values: unknown[] = [];
    const unitFilter = this.unitClause(undefined, allowed, values, 'p');
    const rows = await this.db.$queryRawUnsafe<RawRow[]>(
      `SELECT p.id, p.invoice, p.unit, p.sender, p.subject, p.raw_message,
              p.source_status, p.error_reason, p.created_at, p.updated_at
       FROM ticket_extraction_pending p
       WHERE p.status = 'PENDENTE'${unitFilter}
       ORDER BY p.updated_at DESC, p.id DESC
       LIMIT 100`,
      ...values,
    );
    const countRows = await this.db.$queryRawUnsafe<RawRow[]>(
      `SELECT COUNT(*) AS total FROM ticket_extraction_pending p
       WHERE p.status = 'PENDENTE'${unitFilter}`,
      ...values,
    );
    return {
      total: Number(countRows[0]?.total ?? 0),
      rows: rows.map((row) => ({
        ...row,
        id: Number(row.id),
        unit: row.unit == null ? null : Number(row.unit),
      })),
    };
  }

  async adjustPending(id: number, body: AdjustTicketPendingDto, user: AuthUser) {
    const allowed = await this.allowedUnits(user);
    const values: unknown[] = [id];
    const unitFilter = this.unitClause(undefined, allowed, values, 'p');
    const pending = await this.db.$queryRawUnsafe<RawRow[]>(
      `SELECT p.id FROM ticket_extraction_pending p
       WHERE p.id = ? AND p.status = 'PENDENTE'${unitFilter} LIMIT 1`,
      ...values,
    );
    if (!pending.length) throw new NotFoundException('Pendência não encontrada.');

    const validType = await this.db.$queryRawUnsafe<RawRow[]>(
      `SELECT charge FROM type_of_charge WHERE UPPER(TRIM(charge)) = UPPER(TRIM(?)) LIMIT 1`,
      body.type,
    );
    if (!validType.length) throw new BadRequestException('Tipo de cobrança inválido.');
    const canonicalType = String(validType[0].charge);
    await this.db.$executeRawUnsafe(
      `UPDATE ticket_extraction_pending
       SET raw_message = ?, resolved_type = ?, resolved_freight = ?,
           resolved_by = ?, status = 'AJUSTADO', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      body.message,
      canonicalType,
      body.freight,
      user.cod,
      id,
    );
    return { id, status: 'AJUSTADO', type: canonicalType, freight: body.freight };
  }

  async findAll(query: TicketQueryDto, user: AuthUser) {
    if ((query.start && !query.end) || (!query.start && query.end))
      throw new BadRequestException('Preencha as datas inicial e final.');
    if (query.start && query.end && query.start > query.end)
      throw new BadRequestException('A data inicial deve ser anterior à final.');

    const allowed = await this.allowedUnits(user);
    const values: unknown[] = [];
    let where = ' WHERE 1=1';
    where += this.unitClause(query.unit, allowed, values);
    if (query.type) {
      where += ' AND t.type = ?';
      values.push(query.type);
    }
    if (query.invoiceStatus) {
      where += ' AND EXISTS (SELECT 1 FROM invoices si WHERE si.ticket_id = t.id AND si.status_ticket = ?)';
      values.push(query.invoiceStatus);
    }
    if (query.situation === 'abertos') where += ' AND t.finalized_at IS NULL';
    if (query.situation === 'finalizados') where += ' AND t.finalized_at IS NOT NULL';
    if (query.start && query.end) {
      // Include the entire final day even though created_at stores a time.
      where += ' AND t.created_at >= ? AND t.created_at < DATE_ADD(?, INTERVAL 1 DAY)';
      values.push(query.start, query.end);
    }
    if (query.search) {
      const search = `%${query.search}%`;
      where += ` AND (
        CAST(t.id AS CHAR) LIKE ? OR t.manifest LIKE ? OR t.ctrc LIKE ? OR
        t.responsible LIKE ? OR sender.fantasy_name LIKE ? OR recipient.fantasy_name LIKE ? OR
        payer.fantasy_name LIKE ? OR EXISTS (
          SELECT 1 FROM invoices xi WHERE xi.ticket_id = t.id AND
          (CAST(xi.invoice AS CHAR) LIKE ? OR xi.ticket LIKE ? OR xi.cte LIKE ?)
        )
      )`;
      values.push(...Array(10).fill(search));
    }

    const countRows = await this.db.$queryRawUnsafe<RawRow[]>(
      `SELECT COUNT(*) AS total
       FROM tickets t
       LEFT JOIN companies sender ON sender.cnpj = t.sender
       LEFT JOIN companies recipient ON recipient.cnpj = t.recipient
       LEFT JOIN companies payer ON payer.cnpj = t.freight_payer${where}`,
      ...values,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const offset = (page - 1) * pageSize;
    const rows = await this.db.$queryRawUnsafe<RawRow[]>(
      `SELECT
         t.id, t.cod, t.conf_cod, t.created_at, t.updated_at, t.finalized_at,
         t.unit, b.branch, t.dt_manifest, t.manifest, t.responsible, t.type,
         t.dt_ctrc, t.ctrc, t.freight, t.delivery_date, t.request_date,
         t.return_date, t.sending_request, t.returnSendingRequest,
         DATEDIFF(t.return_date, t.request_date) AS request_days,
         DATEDIFF(t.returnSendingRequest, t.sending_request) AS resend_days,
         t.sender, sender.fantasy_name AS sender_name,
         t.recipient, recipient.fantasy_name AS recipient_name,
         t.freight_payer, payer.fantasy_name AS freight_payer_name,
         GROUP_CONCAT(DISTINCT i.invoice ORDER BY i.invoice SEPARATOR ' / ') AS invoice,
         GROUP_CONCAT(DISTINCT i.ticket ORDER BY i.invoice SEPARATOR ' / ') AS invoice_ticket,
         GROUP_CONCAT(DISTINCT i.type_change ORDER BY i.invoice SEPARATOR ' / ') AS type_change,
         GROUP_CONCAT(DISTINCT i.cte ORDER BY i.invoice SEPARATOR ' / ') AS cte,
         GROUP_CONCAT(DISTINCT i.status_ticket ORDER BY i.invoice SEPARATOR ' / ') AS status_ticket,
         GROUP_CONCAT(DISTINCT i.fatura ORDER BY i.invoice SEPARATOR ' / ') AS fatura,
         t.observation, t.observation2, t.observation3
       FROM tickets t
       LEFT JOIN branches b ON b.unit = t.unit
       LEFT JOIN companies sender ON sender.cnpj = t.sender
       LEFT JOIN companies recipient ON recipient.cnpj = t.recipient
       LEFT JOIN companies payer ON payer.cnpj = t.freight_payer
       LEFT JOIN invoices i ON i.ticket_id = t.id${where}
       GROUP BY t.id
       ORDER BY t.created_at DESC, t.id DESC, i.invoice
       LIMIT ? OFFSET ?`,
      ...values,
      pageSize,
      offset,
    );
    return {
      rows: rows.map((row) => ({
        ...row,
        id: Number(row.id),
        unit: row.unit == null ? null : Number(row.unit),
        invoice: row.invoice == null ? null : String(row.invoice),
        request_days: row.request_days == null ? null : Number(row.request_days),
        resend_days: row.resend_days == null ? null : Number(row.resend_days),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async findOne(id: number, user: AuthUser) {
    const allowed = await this.allowedUnits(user);
    const values: unknown[] = [id];
    const unitFilter = this.unitClause(undefined, allowed, values);
    const rows = await this.db.$queryRawUnsafe<RawRow[]>(
      `SELECT t.*, b.branch,
         sender.fantasy_name AS sender_name,
         recipient.fantasy_name AS recipient_name,
         payer.fantasy_name AS freight_payer_name
       FROM tickets t
       LEFT JOIN branches b ON b.unit = t.unit
       LEFT JOIN companies sender ON sender.cnpj = t.sender
       LEFT JOIN companies recipient ON recipient.cnpj = t.recipient
       LEFT JOIN companies payer ON payer.cnpj = t.freight_payer
       WHERE t.id = ?${unitFilter}
       LIMIT 1`,
      ...values,
    );
    if (!rows.length) throw new NotFoundException('Ticket não encontrado.');
    const invoices = await this.db.$queryRawUnsafe<RawRow[]>(
      `SELECT invoice, ticket, unit, type_change, cte, status_ticket, fatura
       FROM invoices WHERE ticket_id = ? ORDER BY invoice, type_change`,
      id,
    );
    return {
      ...rows[0],
      id: Number(rows[0].id),
      unit: rows[0].unit == null ? null : Number(rows[0].unit),
      invoices: invoices.map((invoice) => ({ ...invoice, invoice: Number(invoice.invoice), unit: Number(invoice.unit) })),
    };
  }
}
