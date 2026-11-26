import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { appSecret } from '../../common/security/secrets';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: appSecret('access'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [ChatGateway, ChatService],
  controllers: [ChatController],
  exports: [ChatGateway, ChatService],
})
export class ChatModule {}
