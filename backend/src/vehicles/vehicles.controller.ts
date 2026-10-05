import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth-user.types';
import { VehiclePayersDto } from './vehicle-payers.dto';

import { VehiclesService } from './vehicles.service';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';

@Controller('vehicles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Put(':plate/payers')
  @RequirePermission('freight_closure')
  updatePayers(
    @Param('plate') plate: string,
    @Body() dto: VehiclePayersDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.vehiclesService.updatePayers(plate, dto, req.user);
  }

  @Get(':plate')
  @RequirePermission('freight_service')
  findByPlate(@Param('plate') plate: string) {
    return this.vehiclesService.findByPlate(plate);
  }
}
