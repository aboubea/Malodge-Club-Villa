import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { FinanceService } from './finance.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@malodge/shared';
import { BadRequestException } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PerformanceService } from './performance.service';

/** The day asked for (AAAA-MM-JJ), today otherwise. */
const refDate = (date?: string) => (date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : new Date());
/** Managers and admins limited to some countries only see their villas. */
const countriesOf = (user: { role: string; countries?: string[] }) => (user.role !== Role.SUPER_ADMIN && user.countries?.length ? user.countries : null);

@ApiTags('Finance')
@ApiBearerAuth()
@Controller('finance')
export class FinanceController {
  constructor(
    private financeService: FinanceService,
    private performance: PerformanceService,
  ) {}

  @Get('performance')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Per-house occupancy, price per night, RevPAR, extras and margins, with N-1 (MAD)' })
  getPerformance(
    @CurrentUser() user: { role: string; countries?: string[] },
    @Query('period') period: 'month' | 'quarter' | 'year' = 'month',
    @Query('date') date?: string,
  ) {
    if (!['month', 'quarter', 'year'].includes(period)) throw new BadRequestException('period : month, quarter ou year');
    return this.performance.report(period, refDate(date), countriesOf(user));
  }

  @Get('dashboard')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Get finance dashboard KPIs — MANAGER+ only' })
  getDashboard(
    @CurrentUser() user: { role: string; countries?: string[] },
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'month',
    @Query('currency') currency?: string,
    @Query('date') date?: string,
  ) {
    if (!['day', 'week', 'month', 'year'].includes(period)) throw new BadRequestException('period : day, week, month ou year');
    return this.financeService.getDashboard(period, currency, refDate(date), countriesOf(user));
  }

  @Get('provider-payouts')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get provider payouts for a given month/year' })
  getProviderPayouts(
    @Query('month') month: string,
    @Query('year') year: string,
    @Query('currency') currency?: string,
  ) {
    const now = new Date();
    return this.financeService.getProviderPayouts(
      month ? parseInt(month) : now.getMonth() + 1,
      year ? parseInt(year) : now.getFullYear(),
      // Converted to dirhams unless one currency is asked for.
      !currency || currency.toUpperCase() === 'ALL',
    );
  }

  @Get('owner-payouts')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get villa owner payouts for a given month/year' })
  getOwnerPayouts(
    @Query('month') month: string,
    @Query('year') year: string,
    @Query('currency') currency?: string,
  ) {
    const now = new Date();
    return this.financeService.getOwnerPayouts(
      month ? parseInt(month) : now.getMonth() + 1,
      year ? parseInt(year) : now.getFullYear(),
      // Converted to dirhams unless one currency is asked for.
      !currency || currency.toUpperCase() === 'ALL',
    );
  }

  @Get('export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Export finance report' })
  async exportReport(
    @Query('period') period: string = 'month',
    @Query('format') format: 'pdf' | 'excel' | 'csv' = 'pdf',
    @Res() res: Response,
    @Query('currency') currency?: string,
    @Query('date') date?: string,
    @CurrentUser() user?: { role: string; countries?: string[] },
  ) {
    return this.financeService.exportReport(period, format, res, currency, refDate(date), user ? countriesOf(user) : null);
  }
}
