import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ExtrasModule } from '../extras/extras.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProviderSpaceController } from './provider-space.controller';
import { ProviderSpaceService } from './provider-space.service';

@Module({
  imports: [JwtModule.register({}), ExtrasModule, NotificationsModule],
  providers: [ProviderSpaceService],
  controllers: [ProviderSpaceController],
})
export class ProviderSpaceModule {}
