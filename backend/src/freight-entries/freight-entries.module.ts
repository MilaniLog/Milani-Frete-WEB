import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FreightCalculationModule } from '../freight-calculation/freight-calculation.module';
import {
  FreightEntriesController,
  FreightExpensesController,
  StandaloneEntriesController,
} from './freight-entries.controller';
import { FreightEntriesService } from './freight-entries.service';

@Module({
  imports: [AuthModule, FreightCalculationModule],
  controllers: [
    FreightEntriesController,
    FreightExpensesController,
    StandaloneEntriesController,
  ],
  providers: [FreightEntriesService],
})
export class FreightEntriesModule {}
