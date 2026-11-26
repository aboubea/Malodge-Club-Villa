import { Module } from '@nestjs/common';
import { ExtrasModule } from '../extras/extras.module';
import { StatementsController } from './statements.controller';
import { StatementsService } from './statements.service';

@Module({
  imports: [ExtrasModule],
  providers: [StatementsService],
  controllers: [StatementsController],
  exports: [StatementsService],
})
export class StatementsModule {}
