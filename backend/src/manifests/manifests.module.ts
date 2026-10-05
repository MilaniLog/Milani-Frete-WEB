import { Module } from '@nestjs/common';

import { ManifestsController } from './manifests.controller';
import { ManifestsService } from './manifests.service';

import { AuthModule } from '../auth/auth.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { DriversModule } from '../drivers/drivers.module';
import { DestinationsModule } from '../destinations/destinations.module';
import { FreightCalculationModule } from '../freight-calculation/freight-calculation.module';

@Module({
  imports: [AuthModule, VehiclesModule, DriversModule, DestinationsModule, FreightCalculationModule],

  controllers: [ManifestsController],

  providers: [ManifestsService],
})
export class ManifestsModule {}
