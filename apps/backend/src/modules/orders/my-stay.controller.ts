import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClientRequestsService } from './client-requests.service';

class RequestItemDto {
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

export class ExtraRequestDto {
  @IsOptional()
  @IsString()
  reservationId?: string;

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
  @Type(() => RequestItemDto)
  items: RequestItemDto[];
}

/** The client's stay: catalogue at the villa's prices, and their requests for extras. */
@ApiTags('My stay')
@ApiBearerAuth()
@Controller('my-stay')
export class MyStayController {
  constructor(private requests: ClientRequestsService) {}

  @Get('catalogue')
  catalogue(@CurrentUser('id') userId: string, @Query('reservationId') reservationId?: string) {
    return this.requests.catalogue(userId, reservationId);
  }

  @Get('requests')
  mine(@CurrentUser('id') userId: string) {
    return this.requests.mine(userId);
  }

  @Post('requests')
  request(@CurrentUser('id') userId: string, @Body() dto: ExtraRequestDto) {
    return this.requests.request(userId, dto);
  }
}
