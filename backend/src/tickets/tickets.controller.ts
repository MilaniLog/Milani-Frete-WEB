import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthenticatedRequest } from '../auth/auth-user.types';
import { AdjustTicketPendingDto, TicketQueryDto } from './tickets.dto';
import { TicketsService } from './tickets.service';

@Controller('tickets')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('ticket_service')
export class TicketsController {
  constructor(private readonly service: TicketsService) {}

  @Get('options')
  options(@Req() request: AuthenticatedRequest) {
    return this.service.options(request.user);
  }

  @Get()
  findAll(@Query() query: TicketQueryDto, @Req() request: AuthenticatedRequest) {
    return this.service.findAll(query, request.user);
  }

  @Get('pending')
  pending(@Req() request: AuthenticatedRequest) {
    return this.service.pending(request.user);
  }

  @Patch('pending/:id')
  adjustPending(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdjustTicketPendingDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.adjustPending(id, body, request.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() request: AuthenticatedRequest) {
    return this.service.findOne(id, request.user);
  }
}
