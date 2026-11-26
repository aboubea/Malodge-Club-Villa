import { Module } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { PerformanceService } from './performance.service';

@Module({
  providers: [FinanceService, PerformanceService],
  controllers: [FinanceController],
  exports: [FinanceService, PerformanceService],
})
export class FinanceModule {}
