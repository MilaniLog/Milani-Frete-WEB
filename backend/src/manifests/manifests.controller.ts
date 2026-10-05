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

import { ManifestsService } from './manifests.service';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateManifestDto } from './dto/create-manifest.dto';
import type { AuthenticatedRequest } from '../auth/auth-user.types';
import { ManifestQueryDto } from './dto/manifest-query.dto';
import { PreviewManifestDto } from './dto/preview-manifest.dto';

@Controller('manifests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ManifestsController {
  constructor(private readonly manifestsService: ManifestsService) {}

  @Get()
  @RequirePermission('freight_service')
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query() query: ManifestQueryDto = {},
  ) {
    return this.manifestsService.findAll(request.user, query.week, query.number, query.recent === 'true');
  }

  @Get(':id')
  @RequirePermission('freight_service')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.manifestsService.findOne(id, request.user);
  }

  @Post()
  @RequirePermission('freight_service')
  create(@Body() dto: CreateManifestDto, @Req() request: AuthenticatedRequest) {
    return this.manifestsService.create(dto, request.user);
  }

  @Post('preview')
  @RequirePermission('freight_service')
  preview(@Body() dto: PreviewManifestDto, @Req() request: AuthenticatedRequest) {
    return this.manifestsService.preview(dto, request.user);
  }

  @Put(':id')
  @RequirePermission('freight_service')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateManifestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.manifestsService.update(id, dto, request.user);
  }

  @Delete(':id')
  @RequirePermission('freight_service')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.manifestsService.remove(id, request.user);
  }
}
