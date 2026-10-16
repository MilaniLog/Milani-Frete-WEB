import {
  Controller,
  Body,
  Post,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';

import { DestinationsService } from './destinations.service';
import { DestinationDto } from './destination.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';

@Controller('destinations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DestinationsController {
  constructor(private readonly destinationsService: DestinationsService) {}
  @Post()
  @RequirePermission('freight_service')
  create(@Body() dto: DestinationDto) {
    return this.destinationsService.create(dto.nome);
  }

  @Get()
  @RequirePermission('freight_service')
  findAll() {
    return this.destinationsService.findAll();
  }

  @Get(':id')
  @RequirePermission('freight_service')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.destinationsService.findById(id);
  }
}
