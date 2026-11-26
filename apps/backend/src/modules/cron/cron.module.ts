import { Module } from '@nestjs/common';
import { StatementsModule } from '../statements/statements.module';
import { StaySpaceModule } from '../stay-space/stay-space.module';
import { CronController } from './cron.controller';

@Module({
  imports: [StatementsModule, StaySpaceModule],
  controllers: [CronController],
})
export class CronModule {}
