import { Controller, Post, Get, Body, Param, Query, ForbiddenException } from '@nestjs/common';
import { AI_CONCIERGE_ENABLED } from '../../common/features';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@malodge/shared';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

  @Post('query')
  @ApiOperation({ summary: 'Query the AI concierge' })
  query(@Body() dto: { question: string }, @CurrentUser('sub') userId: string) {
    // Greyed out in the app for every role: closed here too, whoever calls.
    if (!AI_CONCIERGE_ENABLED) throw new ForbiddenException('Le concierge IA sera bientôt disponible.');
    return this.aiService.query(dto.question, userId);
  }

  @Post('ingest/:documentId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Re-extract and index a document (admin)' })
  async ingest(
    @Param('documentId') documentId: string,
    @Body() dto: { textContent: string },
  ) {
    await this.aiService.ingestDocument(documentId, dto.textContent);
    return { success: true };
  }

  @Get('history')
  @ApiOperation({ summary: 'Get AI query history for current user' })
  getHistory(
    @CurrentUser('sub') userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.aiService.getHistory(userId, limit ? parseInt(limit) : 20);
  }
}
