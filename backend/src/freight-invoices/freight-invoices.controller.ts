import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthenticatedRequest } from '../auth/auth-user.types';
import { WeekFilterDto } from '../weeks/weeks.dto';
import {
  CouponDto,
  InvoiceDto,
  InvoiceTypeDto,
  InvoiceLaunchDto,
  InvoiceNumberDto,
} from './freight-invoices.dto';
import { FreightInvoicesService } from './freight-invoices.service';

@Controller('freight-invoice-types')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('freight_service')
export class FreightInvoiceTypesController {
  constructor(private readonly service: FreightInvoicesService) {}
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.service.listTypes(req.user);
  }
  @Post()
  create(@Body() dto: InvoiceTypeDto, @Req() req: AuthenticatedRequest) {
    return this.service.saveType(dto, req.user);
  }
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: InvoiceTypeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.saveType(dto, req.user, id);
  }
}

@Controller('freight-invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('freight_service')
export class FreightInvoicesController {
  constructor(private readonly service: FreightInvoicesService) {}
  @Get('by-number')
  byNumber(@Query() query: InvoiceNumberDto, @Req() req: AuthenticatedRequest) {
    return this.service.findByNumber(query.numero, req.user);
  }
  @Get('launches/:id')
  launch(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.findLaunch(id, req.user);
  }
  @Post('launches')
  createLaunch(
    @Body() dto: InvoiceLaunchDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.createLaunch(dto, req.user);
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
  create(@Body() dto: InvoiceDto, @Req() req: AuthenticatedRequest) {
    return this.service.save(dto, req.user);
  }
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: InvoiceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.save(dto, req.user, id);
  }
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.remove(id, req.user);
  }
  @Get(':id/coupons')
  coupons(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: WeekFilterDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.listCoupons(id, req.user, query.week);
  }
  @Post(':id/coupons')
  createCoupon(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CouponDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.changeCoupon(id, req.user, { kind: 'create', dto });
  }
  @Put(':id/coupons/:couponId')
  updateCoupon(
    @Param('id', ParseIntPipe) id: number,
    @Param('couponId', ParseIntPipe) couponId: number,
    @Body() dto: CouponDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.changeCoupon(id, req.user, {
      kind: 'update',
      couponId,
      dto,
    });
  }
  @Delete(':id/coupons/:couponId')
  removeCoupon(
    @Param('id', ParseIntPipe) id: number,
    @Param('couponId', ParseIntPipe) couponId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.changeCoupon(id, req.user, {
      kind: 'delete',
      couponId,
    });
  }
}
