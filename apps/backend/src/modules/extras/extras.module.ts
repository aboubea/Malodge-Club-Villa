import { Module } from '@nestjs/common';
import { ExtrasController } from './extras.controller';
import { ExtrasService } from './extras.service';
import { CommissionRulesController } from './commission-rules.controller';
import { CommissionRulesService } from './commission-rules.service';

@Module({
  controllers: [CommissionRulesController, ExtrasController],
  providers: [ExtrasService, CommissionRulesService],
  exports: [ExtrasService],
})
export class ExtrasModule {}
