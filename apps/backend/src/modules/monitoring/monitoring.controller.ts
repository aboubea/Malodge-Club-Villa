import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@malodge/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { AttemptsService } from '../auth/attempts.service';
import { MonitoringService } from './monitoring.service';

@ApiTags('Monitoring')
@ApiBearerAuth()
@Controller('monitoring')
export class MonitoringController {
  constructor(
    private monitoring: MonitoringService,
    private attempts: AttemptsService,
  ) {}

  /** Incidents of the last days, login failures and configuration checks. */
  @Get()
  @Roles(Role.ADMIN)
  async overview(@Query('days') days?: string) {
    const [overview, logins] = await Promise.all([this.monitoring.overview(Math.min(Math.max(Number(days) || 14, 1), 90)), this.attempts.summary()]);
    return { ...overview, logins };
  }
}
