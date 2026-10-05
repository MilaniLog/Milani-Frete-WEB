import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthenticatedRequest } from '../auth/auth-user.types';
import { ReportsService } from './reports.service';
import { ReportQuery } from './reports.dto';
import { reportHtml, reportSpreadsheet } from './report-render';
@Controller('freight-reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('freight_service')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}
  @Get('financial') @Header('Cache-Control', 'no-store') financial(
    @Query() q: ReportQuery,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.financial(q, req.user);
  }
  @Get('payments') @Header('Cache-Control', 'no-store') payments(
    @Query() q: ReportQuery,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.payments(q, req.user);
  }
  @Get('financial/print')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  )
  async financialPrint(
    @Query() q: ReportQuery,
    @Req() req: AuthenticatedRequest,
  ) {
    return reportHtml(await this.service.financial(q, req.user));
  }
  @Get('payments/print')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  )
  async paymentsPrint(
    @Query() q: ReportQuery,
    @Req() req: AuthenticatedRequest,
  ) {
    return reportHtml(await this.service.payments(q, req.user));
  }
  @Get('payments/spreadsheet')
  @Header('Content-Type', 'application/vnd.ms-excel; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async sheet(@Query() q: ReportQuery, @Req() req: AuthenticatedRequest) {
    return reportSpreadsheet(await this.service.payments(q, req.user));
  }
  @Get('closures/reprint')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  )
  reprint(@Query() q: ReportQuery, @Req() req: AuthenticatedRequest) {
    return this.service.reprint(q, req.user);
  }
}
