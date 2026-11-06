import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthenticatedRequest } from '../auth/auth-user.types';
import { combineHtml, reportHtml } from '../reports/report-render';
import { CreateValeInvoiceDto, PreviewValeInvoiceDto } from './vale-invoices.dto';
import { ValeInvoicesService } from './vale-invoices.service';

@Controller('vale-invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('freight_service')
export class ValeInvoicesController {
  constructor(private readonly service: ValeInvoicesService) {}

  @Post()
  create(@Body() dto: CreateValeInvoiceDto, @Req() req: AuthenticatedRequest) {
    return this.service.create(dto, req.user);
  }

  @Get('preview')
  @Header('Cache-Control', 'no-store')
  preview(
    @Query() dto: PreviewValeInvoiceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.preview(dto, req.user);
  }

  @Get('preview/print')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async printPreview(@Query() dto: PreviewValeInvoiceDto, @Req() req: AuthenticatedRequest) {
    return reportHtml((await this.service.previewReports(dto, req.user))[0]);
  }

  @Get('preview/print-separated')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async printSeparatedPreview(@Query() dto: PreviewValeInvoiceDto, @Req() req: AuthenticatedRequest) {
    return combineHtml(
      (await this.service.previewReports(dto, req.user, true)).map(reportHtml),
    );
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthenticatedRequest, @Query('numero') numero?: string) {
    return this.service.list(req.user, numero);
  }

  @Get(':id/print')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async print(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return reportHtml(await this.service.report(id, req.user));
  }

  @Get(':id/print-separated')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async printSeparated(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return combineHtml(
      (await this.service.separatedReports(id, req.user)).map(reportHtml),
    );
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.service.findOne(id, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.service.remove(id, req.user);
  }
}
