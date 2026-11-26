import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateVillaDto {
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
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  images?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  amenities?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  rules?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxGuests?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  bedrooms?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  bathrooms?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Management fee on accommodation revenue, as a fraction (0.2 = 20 %). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  managementFeeRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  customFields?: Array<{ label: string; value: string }>;
}
