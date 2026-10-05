import { Module } from '@nestjs/common';

import { FreightCalculationController } from './freight-calculation.controller';
import { FreightCalculationService } from './freight-calculation.service';

import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],

  controllers: [FreightCalculationController],

  providers: [FreightCalculationService],

  exports: [FreightCalculationService],
})
export class FreightCalculationModule {}
