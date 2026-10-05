import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  FreightInvoiceTypesController,
  FreightInvoicesController,
} from './freight-invoices.controller';
import { FreightInvoicesService } from './freight-invoices.service';

@Module({
  imports: [AuthModule],
  controllers: [FreightInvoiceTypesController, FreightInvoicesController],
  providers: [FreightInvoicesService],
})
export class FreightInvoicesModule {}
