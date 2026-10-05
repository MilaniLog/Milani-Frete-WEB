import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import { DriversService } from './drivers.service';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';

@Controller('drivers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get()
  @RequirePermission('freight_service')
  findAll() {
    return this.driversService.findAll();
  }

  @Get(':cpf')
  @RequirePermission('freight_service')
  findByCpf(@Param('cpf') cpf: string) {
    return this.driversService.findByCpf(cpf);
  }
}
