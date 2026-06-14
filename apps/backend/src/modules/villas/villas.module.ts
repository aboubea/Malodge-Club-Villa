import { Module } from '@nestjs/common';
import { VillasService } from './villas.service';
import { VillasController } from './villas.controller';

@Module({
  providers: [VillasService],
  controllers: [VillasController],
  exports: [VillasService],
})
export class VillasModule {}
