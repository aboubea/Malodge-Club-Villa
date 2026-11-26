import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { LodgifyModule } from '../lodgify/lodgify.module';
import { MyStayGuideController, StaySpaceController, StaysOnboardingController, VillaGuideController } from './stay-space.controller';
import { StaySpaceService } from './stay-space.service';

@Module({
  imports: [OrdersModule, LodgifyModule],
  providers: [StaySpaceService],
  controllers: [StaySpaceController, StaysOnboardingController, VillaGuideController, MyStayGuideController],
  exports: [StaySpaceService],
})
export class StaySpaceModule {}
