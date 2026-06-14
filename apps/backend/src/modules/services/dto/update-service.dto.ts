import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, IsPositive } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateServiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  images?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  basePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  duration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresDate?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresTime?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
