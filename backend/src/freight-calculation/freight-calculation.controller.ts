import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { FreightCalculationService } from './freight-calculation.service';

import { CalculateFreightDto } from './dto/calculate-freight.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';

@Controller('freight-calculation')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FreightCalculationController {
  constructor(
    private readonly freightCalculationService: FreightCalculationService,
  ) {}

  @Post('preview')
  @RequirePermission('freight_service')
  preview(@Body() dto: CalculateFreightDto) {
    return this.freightCalculationService.calculate(dto);
  }
}
