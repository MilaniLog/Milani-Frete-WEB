import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/auth-user.types';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.user);
  }

  @Post()
  create(@Body() dto: CreateUserDto, @Req() req: AuthenticatedRequest) {
    return this.service.create(dto, req.user);
  }

  @Put(':cod')
  update(
    @Param('cod', ParseIntPipe) cod: number,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.update(cod, dto, req.user);
  }
}
