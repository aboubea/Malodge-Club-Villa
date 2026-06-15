import { Module } from '@nestjs/common';
import { LodgifyService } from './lodgify.service';
import { LodgifyController } from './lodgify.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LodgifyController],
  providers: [LodgifyService],
  exports: [LodgifyService],
})
export class LodgifyModule {}
