import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FreightClosuresController } from './freight-closures.controller';
import { FreightClosuresService } from './freight-closures.service';
import { ConferenceService } from './conference.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [FreightClosuresController],
  providers: [FreightClosuresService, ConferenceService],
})
export class FreightClosuresModule {}
