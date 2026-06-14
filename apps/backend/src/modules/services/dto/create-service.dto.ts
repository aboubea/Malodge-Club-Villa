import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateServiceDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  images?: string[];

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  basePrice: number;

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

  @ApiProperty()
  @IsString()
  categoryId: string;
}

export class CreateServiceCategoryDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;
}
