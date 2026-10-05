import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthenticatedRequest } from '../auth/auth-user.types';
import {
  DriverRegistrationDto,
  VehicleRegistrationDto,
} from './registration.dto';
import { RegistrationsService } from './registrations.service';
@Controller('registrations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('freight_service')
export class RegistrationsController {
  constructor(private readonly service: RegistrationsService) {}
  @Get('companies') companies() {
    return this.service.companies();
  }
  @Get('vehicle-types') types() {
    return this.service.types();
  }
  @Get('drivers') drivers() {
    return this.service.drivers();
  }
  @Get('vehicles') vehicles() {
    return this.service.vehicles();
  }
  @Post('drivers') createDriver(
    @Body() dto: DriverRegistrationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.driver(dto, req.user);
  }
  @Put('drivers/:cpf') updateDriver(
    @Param('cpf') cpf: string,
    @Body() dto: DriverRegistrationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.driver(dto, req.user, cpf);
  }
  @Post('vehicles') createVehicle(
    @Body() dto: VehicleRegistrationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.vehicle(dto, req.user);
  }
  @Put('vehicles/:plate') updateVehicle(
    @Param('plate') plate: string,
    @Body() dto: VehicleRegistrationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.vehicle(dto, req.user, plate);
  }
  @Delete('vehicles/:plate')
  removeVehicle(@Param('plate') plate: string, @Req() req: AuthenticatedRequest) {
    return this.service.removeVehicle(plate, req.user);
  }
}
