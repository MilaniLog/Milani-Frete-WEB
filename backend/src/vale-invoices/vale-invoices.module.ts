import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ValeInvoicesController } from './vale-invoices.controller';
import { ValeInvoicesService } from './vale-invoices.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ValeInvoicesController],
  providers: [ValeInvoicesService],
})
export class ValeInvoicesModule {}
