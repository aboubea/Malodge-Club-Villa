import { IsString, IsDateString, IsNumber, IsOptional, IsPositive, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReservationDto {
  @ApiProperty()
  @IsString()
  villaId: string;

  @ApiProperty()
  @IsString()
  clientId: string;

  @ApiProperty()
  @IsDateString()
  checkIn: string;

  @ApiProperty()
  @IsDateString()
  checkOut: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  guests?: number;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  totalAmount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;
}
