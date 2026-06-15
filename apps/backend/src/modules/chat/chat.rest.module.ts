import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { PrismaModule } from '../../prisma/prisma.module';

// REST-only ChatModule for serverless (no WebSocket gateway).
// The full ChatModule with ChatGateway is only used in the local NestJS server.
@Module({
  imports: [PrismaModule],
  providers: [ChatService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatRestModule {}
