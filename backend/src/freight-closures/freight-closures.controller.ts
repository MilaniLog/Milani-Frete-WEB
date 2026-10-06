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
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { Response } from 'express';
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
import { renderHtmlPdf } from '../reports/pdf-renderer';

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

  @Get('conference/print.pdf')
  @Header('Cache-Control', 'no-store')
  async conferencePrintPdf(
    @Query() dto: ConferenceDto,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const html = await this.conferencePrint(dto, req);
    const pdf = await renderHtmlPdf(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="conferencia.pdf"',
    );
    res.send(pdf);
  }

  @Post('conference/adjusted-print.pdf')
  @Header('Cache-Control', 'no-store')
  async adjustedConferencePrintPdf(
    @Body() dto: WeekClosureDto,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const previews = await this.service.adjustedWeekPreview(
      dto.semana,
      req.user,
      dto.selections,
    );
    const reports = previews.map((preview) => {
      const report = previewReport(preview);
      report.cabecalho.unit = req.user.unit;
      report.cabecalho.status = 'CONFERÊNCIA — NÃO FINALIZA PAGAMENTOS';
      return renderClosureReport(report);
    });
    const html = reports.length
      ? reports[0].slice(0, reports[0].indexOf('<body>') + 6) +
        reports
          .map((report, index) => {
            const body = report.slice(
              report.indexOf('<body>') + 6,
              report.lastIndexOf('</body>'),
            );
            return `<section style="${index ? 'break-before:page' : ''}">${body}</section>`;
          })
          .join('') +
        '</body></html>'
      : '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Conferência</title><body><p>Nenhum registro encontrado.</p></body></html>';
    const pdf = await renderHtmlPdf(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="conferencia-ajustada.pdf"',
    );
    res.send(pdf);
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

  @Get('preview/print.pdf')
  @Header('Cache-Control', 'no-store')
  async printPreviewPdf(
    @Query() dto: ClosureDto,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const html = await this.printPreview(dto, req);
    const pdf = await renderHtmlPdf(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="conferencia.pdf"',
    );
    res.send(pdf);
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

  @Get(':id/print.pdf')
  @Header('Cache-Control', 'no-store')
  async printPdf(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const html = await this.print(id, req);
    const pdf = await renderHtmlPdf(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="fechamento-${id}.pdf"`,
    );
    res.send(pdf);
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
    return this.service.finalizeWeek(dto.semana, req.user, dto.selections);
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
