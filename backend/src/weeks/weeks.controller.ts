import {
  Body,
  Controller,
  Get,
  Param,
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
import { WeeksService } from './weeks.service';
import { WeekDto, WeekQueryDto } from './weeks.dto';

@Controller('weeks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('freight_service')
export class WeeksController {
  constructor(private readonly service: WeeksService) {}
  @Get()
  list(@Query() query: WeekQueryDto) {
    return this.service.list(query.date);
  }
  @Get(':codigo')
  findOne(@Param('codigo') codigo: string) {
    return this.service.findOne(codigo);
  }
  @Post()
  create(@Body() dto: WeekDto, @Req() request: AuthenticatedRequest) {
    return this.service.save(dto, request.user);
  }
  @Put(':codigo')
  update(
    @Param('codigo') codigo: string,
    @Body() dto: WeekDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.save(dto, request.user, codigo);
  }
}
