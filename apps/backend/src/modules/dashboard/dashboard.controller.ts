import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@malodge/shared';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get()
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Get dashboard summary metrics — MANAGER+ only' })
  getSummary() {
    return this.dashboardService.getSummary();
  }

  @Get('today')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Home page: today’s arrivals and departures, the week’s arrivals, what is waiting to be done' })
  getToday() {
    return this.dashboardService.today();
  }
}
