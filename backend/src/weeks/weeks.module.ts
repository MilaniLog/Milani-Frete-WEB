import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WeeksController } from './weeks.controller';
import { WeeksService } from './weeks.service';

@Module({
  imports: [AuthModule],
  controllers: [WeeksController],
  providers: [WeeksService],
})
export class WeeksModule {}
