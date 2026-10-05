import { Module } from '@nestjs/common';
import { ReportsModule } from './reports/reports.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { ManifestsModule } from './manifests/manifests.module';
import { AuthModule } from './auth/auth.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { DriversModule } from './drivers/drivers.module';
import { DestinationsModule } from './destinations/destinations.module';
import { FreightCalculationModule } from './freight-calculation/freight-calculation.module';
import { FreightEntriesModule } from './freight-entries/freight-entries.module';
import { WeeksModule } from './weeks/weeks.module';
import { FreightInvoicesModule } from './freight-invoices/freight-invoices.module';
import { FreightClosuresModule } from './freight-closures/freight-closures.module';

@Module({
  imports: [
    ReportsModule,
    RegistrationsModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    PrismaModule,
    ManifestsModule,
    AuthModule,
    VehiclesModule,
    DriversModule,
    DestinationsModule,
    FreightCalculationModule,
    FreightEntriesModule,
    WeeksModule,
    FreightInvoicesModule,
    FreightClosuresModule,
  ],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
