import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { MyStayController } from './my-stay.controller';
import { ClientRequestsService } from './client-requests.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [OrdersService, ClientRequestsService],
  controllers: [OrdersController, MyStayController],
  exports: [OrdersService],
})
export class OrdersModule {}
