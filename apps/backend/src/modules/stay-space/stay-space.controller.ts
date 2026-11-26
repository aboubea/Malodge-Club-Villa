import { Body, Controller, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Role } from '@malodge/shared';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StaySpaceService } from './stay-space.service';
import { Step } from './onboarding';

class InviteDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}

class MarkSentDto {
  @IsIn(['welcome', 'j7', 'j1', 'thanks'])
  step: Step;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  channel?: string;
}

class GuestItemDto {
  @IsString()
  serviceId: string;

  @IsInt()
  @Min(1)
  @Max(50)
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

class GuestRequestDto {
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GuestItemDto)
  items: GuestItemDto[];
}

/** The guest's stay space, opened with their personal link (header X-Stay-Key). */
@ApiTags('Stay space')
@Controller('stay-space')
export class StaySpaceController {
  constructor(private stays: StaySpaceService) {}

  @Get('me')
  @Public()
  me(@Headers('x-stay-key') key?: string) {
    return this.stays.guestView(key);
  }

  @Post('requests')
  @Public()
  request(@Headers('x-stay-key') key: string | undefined, @Body() dto: GuestRequestDto) {
    return this.stays.guestRequest(key, dto);
  }
}

/** Team: inviting the guest of a booking, and the arrivals to welcome. */
@ApiTags('Stays')
@ApiBearerAuth()
@Controller('stays')
export class StaysOnboardingController {
  constructor(private stays: StaySpaceService) {}

  @Get('onboarding')
  @Roles(Role.MANAGER)
  onboarding(@Query('days') days?: string) {
    return this.stays.onboarding(Math.min(Math.max(Number(days) || 30, 1), 120));
  }

  @Get(':id/access')
  @Roles(Role.MANAGER)
  access(@Param('id') id: string) {
    return this.stays.access(id);
  }

  @Post(':id/invite')
  @Roles(Role.MANAGER)
  invite(@Param('id') id: string, @Body() dto: InviteDto) {
    return this.stays.invite(id, dto);
  }

  @Post(':id/revoke')
  @Roles(Role.MANAGER)
  revoke(@Param('id') id: string) {
    return this.stays.revoke(id);
  }

  @Post(':id/journey')
  @Roles(Role.MANAGER)
  markSent(@Param('id') id: string, @Body() dto: MarkSentDto) {
    return this.stays.markSent(id, dto.step, dto.channel || 'whatsapp');
  }
}

/** Team: the villa's welcome booklet. */
@ApiTags('Villas')
@ApiBearerAuth()
@Controller('villas')
export class VillaGuideController {
  constructor(private stays: StaySpaceService) {}

  @Get(':id/guide')
  @Roles(Role.MANAGER)
  get(@Param('id') id: string) {
    return this.stays.getGuide(id);
  }

  @Put(':id/guide')
  @Roles(Role.MANAGER)
  save(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.stays.saveGuide(id, body);
  }
}

/** A signed-in client: the booklet of one of their stays. */
@ApiTags('My stay')
@ApiBearerAuth()
@Controller('my-stay')
export class MyStayGuideController {
  constructor(private stays: StaySpaceService) {}

  @Get('guide')
  guide(@CurrentUser('id') userId: string, @Query('reservationId') reservationId: string) {
    return this.stays.clientGuide(userId, reservationId);
  }
}
