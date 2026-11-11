import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
