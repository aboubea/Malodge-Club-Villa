import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProviderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  siret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  iban?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
