import { Module } from '@nestjs/common';

import { DestinationsController } from './destinations.controller';
import { DestinationsService } from './destinations.service';

import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],

  controllers: [DestinationsController],

  providers: [DestinationsService],

  exports: [DestinationsService],
})
export class DestinationsModule {}
