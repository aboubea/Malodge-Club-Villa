import { IsString, IsOptional, IsNumber, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVillaDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsString()
  address: string;

  @ApiProperty()
  @IsString()
  city: string;

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
}
