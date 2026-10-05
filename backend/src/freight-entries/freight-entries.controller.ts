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
import { FreightEntriesService } from './freight-entries.service';
import { EntryDto } from './dto/entry.dto';
import { ExpenseDto } from './dto/expense.dto';
import { WeekFilterDto } from '../weeks/weeks.dto';
import { StandaloneEntryDto } from './dto/standalone-entry.dto';

@Controller('freight-entries')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('freight_service')
export class StandaloneEntriesController {
  constructor(private readonly service: FreightEntriesService) {}
  @Delete(':id') remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.removeStandalone(id, request.user);
  }
  @Get('number/:number') byNumber(
    @Param('number', ParseIntPipe) number: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.findByNumber(number, request.user);
  }
  @Put(':id') update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StandaloneEntryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.createStandalone(dto, request.user, id);
  }
  @Post() create(
    @Body() dto: StandaloneEntryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.createStandalone(dto, request.user);
  }
}

@Controller('freight-expenses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('freight_service')
export class FreightExpensesController {
  constructor(private readonly service: FreightEntriesService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.service.listExpenses(request.user);
  }

  @Post()
  create(@Body() dto: ExpenseDto, @Req() request: AuthenticatedRequest) {
    return this.service.saveExpense(dto, request.user);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExpenseDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.saveExpense(dto, request.user, id);
  }
}

@Controller('manifests/:manifestId/entries')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('freight_service')
export class FreightEntriesController {
  constructor(private readonly service: FreightEntriesService) {}

  @Get()
  list(
    @Param('manifestId', ParseIntPipe) manifestId: number,
    @Req() request: AuthenticatedRequest,
    @Query() query: WeekFilterDto = {},
  ) {
    return this.service.listEntries(manifestId, request.user, query.week);
  }

  @Post()
  create(
    @Param('manifestId', ParseIntPipe) manifestId: number,
    @Body() dto: EntryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.changeEntry(manifestId, request.user, {
      kind: 'create',
      dto,
    });
  }

  @Put(':id')
  update(
    @Param('manifestId', ParseIntPipe) manifestId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EntryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.changeEntry(manifestId, request.user, {
      kind: 'update',
      id,
      dto,
    });
  }

  @Delete(':id')
  remove(
    @Param('manifestId', ParseIntPipe) manifestId: number,
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.changeEntry(manifestId, request.user, {
      kind: 'delete',
      id,
    });
  }
}
