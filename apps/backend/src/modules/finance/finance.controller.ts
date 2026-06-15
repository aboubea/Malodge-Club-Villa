import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { FinanceService } from './finance.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@malodge/shared';

@ApiTags('Finance')
@ApiBearerAuth()
@Controller('finance')
export class FinanceController {
  constructor(private financeService: FinanceService) {}

  @Get('dashboard')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Get finance dashboard KPIs — MANAGER+ only' })
  getDashboard(@Query('period') period: 'day' | 'week' | 'month' | 'year' = 'month') {
    return this.financeService.getDashboard(period);
  }

  @Get('provider-payouts')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get provider payouts for a given month/year' })
  getProviderPayouts(
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const now = new Date();
    return this.financeService.getProviderPayouts(
      month ? parseInt(month) : now.getMonth() + 1,
      year ? parseInt(year) : now.getFullYear(),
    );
  }

  @Get('owner-payouts')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get villa owner payouts for a given month/year' })
  getOwnerPayouts(
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const now = new Date();
    return this.financeService.getOwnerPayouts(
      month ? parseInt(month) : now.getMonth() + 1,
      year ? parseInt(year) : now.getFullYear(),
    );
  }

  @Get('export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Export finance report' })
  async exportReport(
    @Query('period') period: string = 'month',
    @Query('format') format: 'pdf' | 'excel' | 'csv' = 'pdf',
    @Res() res: Response,
  ) {
    return this.financeService.exportReport(period, format, res);
  }
}
