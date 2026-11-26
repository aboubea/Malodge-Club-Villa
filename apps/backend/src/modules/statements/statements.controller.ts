import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '@malodge/shared';
import { IsOptional, IsString, Matches } from 'class-validator';
import { Roles, AllowRestrictedRoles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StatementsService } from './statements.service';
import { previousMonth } from './statement';

class MonthDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month: string;
}

class MarkSentDto {
  @IsOptional()
  @IsString()
  how?: string;
}

@ApiTags('Owner statements')
@ApiBearerAuth()
@Controller('owner-statements')
export class StatementsController {
  constructor(private statements: StatementsService) {}

  @Get()
  @Roles(Role.ADMIN)
  list(@Query('month') month?: string) {
    return this.statements.list(month || previousMonth());
  }

  @Post('prepare')
  @Roles(Role.ADMIN)
  prepare(@Body() dto: MonthDto) {
    return this.statements.prepareMonth(dto.month);
  }

  @Post('send-all')
  @Roles(Role.ADMIN)
  sendAll(@Body() dto: MonthDto, @CurrentUser('id') actorId: string) {
    return this.statements.sendAll(dto.month, actorId);
  }

  /** The caller's own statements (owners; empty for anybody else). */
  @Get('mine')
  @AllowRestrictedRoles()
  mine(@CurrentUser('id') userId: string) {
    return this.statements.mine(userId);
  }

  @Post(':id/recompute')
  @Roles(Role.ADMIN)
  recompute(@Param('id') id: string) {
    return this.statements.recompute(id);
  }

  @Post(':id/send')
  @Roles(Role.ADMIN)
  send(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.statements.send(id, actorId);
  }

  @Post(':id/mark-sent')
  @Roles(Role.ADMIN)
  markSent(@Param('id') id: string, @Body() dto: MarkSentDto, @CurrentUser('id') actorId: string) {
    return this.statements.markSent(id, actorId, dto.how || 'remis autrement');
  }

  @Get(':id/pdf')
  @AllowRestrictedRoles()
  async pdf(@Param('id') id: string, @CurrentUser() user: { id: string; role: string }, @Res() res: Response) {
    const { buffer, filename } = await this.statements.pdf(id, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.end(buffer);
  }
}
