import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

/** Global: the error filter and any service can record an incident. */
@Global()
@Module({
  imports: [AuthModule],
  providers: [MonitoringService],
  controllers: [MonitoringController],
  exports: [MonitoringService],
})
export class MonitoringModule {}
