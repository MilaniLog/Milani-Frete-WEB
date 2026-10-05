import {
  Body,
  Controller,
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
import {
  CancelClosureDto,
  ClosureDto,
  ConferenceDto,
  WeekClosureDto,
} from './freight-closures.dto';
import { ConferenceService } from './conference.service';
import { FreightClosuresService } from './freight-closures.service';
import {
  previewReport,
  savedReport,
  renderClosureReport,
} from './closure-report';

@Controller('freight-closures')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('freight_closure')
export class FreightClosuresController {
  constructor(
    private readonly service: FreightClosuresService,
    private readonly conference: ConferenceService,
  ) {}
  @Get('conference') conferenceReport(
    @Query() dto: ConferenceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.conference.report(dto, req.user);
  }
  @Get('conference/print')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  )
  async conferencePrint(
    @Query() dto: ConferenceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.conference.report(dto, req.user);
    const reports = data.groups.map((group) => {
      const report = previewReport(group);
      report.cabecalho.unit = req.user.unit;
      report.cabecalho.status = 'CONFERÊNCIA — NÃO FINALIZA PAGAMENTOS';
      return renderClosureReport(report);
    });
    if (!reports.length)
      return '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Conferência</title><body><p>Nenhum registro encontrado.</p></body></html>';
    const bodies = reports.map((html) =>
      html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>')),
    );
    return (
      reports[0].slice(0, reports[0].indexOf('<body>') + 6) +
      bodies
        .map(
          (body, i) =>
            `<section style="${i ? 'break-before:page' : ''}">${body}</section>`,
        )
        .join('') +
      '</body></html>'
    );
  }
  @Get('number/:number/report') async reportNumber(
    @Param('number', ParseIntPipe) numero: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return savedReport(await this.service.findByNumber(numero, req.user));
  }
  @Get('preview/print')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  )
  async printPreview(
    @Query() dto: ClosureDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const report = previewReport(await this.service.preview(dto, req.user));
    report.cabecalho.unit = req.user.unit;
    return renderClosureReport(report);
  }

  @Get(':id/report')
  @Header('Cache-Control', 'no-store')
  async report(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return savedReport(await this.service.findOne(id, req.user));
  }

  @Get(':id/print')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  )
  async print(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return renderClosureReport(
      savedReport(await this.service.findOne(id, req.user)),
    );
  }
  @Get('preview')
  preview(@Query() dto: ClosureDto, @Req() req: AuthenticatedRequest) {
    return this.service.preview(dto, req.user);
  }
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.user);
  }
  @Get(':id')
  one(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.service.findOne(id, req.user);
  }
  @Post()
  finalize(@Body() dto: ClosureDto, @Req() req: AuthenticatedRequest) {
    return this.service.finalize(dto, req.user);
  }

  @Post('week')
  finalizeWeek(@Body() dto: WeekClosureDto, @Req() req: AuthenticatedRequest) {
    return this.service.finalizeWeek(dto.semana, req.user);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelClosureDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.cancel(id, dto, req.user);
  }
}
