import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { TwilioService } from './twilio.service';
import { AutomationService } from './automation.service';

@Module({
  providers: [NotificationsService, TwilioService, AutomationService],
  controllers: [NotificationsController],
  exports: [NotificationsService, AutomationService],
})
export class NotificationsModule {}
