import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReservationStatus } from '@mahodge/shared';

export class UpdateReservationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  checkIn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  checkOut?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  guests?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @ApiPropertyOptional({ enum: ReservationStatus })
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
