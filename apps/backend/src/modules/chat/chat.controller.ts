import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread message count' })
  getUnreadCount(@CurrentUser('sub') userId: string) {
    return this.chatService.getUnreadCount(userId).then((count) => ({ count }));
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List user conversations' })
  getConversations(@CurrentUser('sub') userId: string) {
    return this.chatService.getConversations(userId);
  }

  @Post('conversations')
  @ApiOperation({ summary: 'Create a new conversation' })
  createConversation(
    @CurrentUser('sub') userId: string,
    @Body() dto: { participantIds: string[]; reservationId?: string; topic?: string },
  ) {
    // Ensure creator is a participant
    const participantIds = Array.from(new Set([userId, ...dto.participantIds]));
    return this.chatService.createConversation({ ...dto, participantIds });
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get conversation with messages' })
  getConversation(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.chatService.getConversation(id, userId);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send message (REST fallback)' })
  sendMessage(
    @Param('id') conversationId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: { content: string; type?: string; fileUrl?: string },
  ) {
    return this.chatService.sendMessage(conversationId, userId, dto.content, dto.type || 'text', dto.fileUrl);
  }
}
