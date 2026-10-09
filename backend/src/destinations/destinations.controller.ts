import {
  Controller,
  Body,
  Post,
  Get,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';

import { DestinationsService } from './destinations.service';
import { DestinationDto } from './destination.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthenticatedRequest } from '../auth/auth-user.types';

@Controller('destinations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DestinationsController {
  constructor(private readonly destinationsService: DestinationsService) {}
  @Post()
  @RequirePermission('freight_service')
  create(@Body() dto: DestinationDto, @Req() request: AuthenticatedRequest) {
    return this.destinationsService.create(dto.nome, request.user, dto.unit);
  }

  @Get()
  @RequirePermission('freight_service')
  findAll(@Req() request: AuthenticatedRequest) {
    return this.destinationsService.findAll(request.user);
  }

  @Get(':id')
  @RequirePermission('freight_service')
  findById(@Param('id', ParseIntPipe) id: number, @Req() request: AuthenticatedRequest) {
    return this.destinationsService.findById(id, request.user);
  }
}
