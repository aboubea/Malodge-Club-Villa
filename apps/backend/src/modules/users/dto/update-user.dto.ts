import { IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@malodge/shared';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countries?: string[];

  @ApiPropertyOptional({ description: 'false = internal record without app access' })
  @IsOptional()
  @IsBoolean()
  canLogin?: boolean;

  @ApiPropertyOptional({ description: 'Owner/employee commission rate, 0.25 = 25 %', nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRate?: number | null;

  @ApiPropertyOptional({ enum: ['MALODGE_MARGIN', 'TOTAL_MARGIN'], nullable: true })
  @IsOptional()
  @IsIn(['MALODGE_MARGIN', 'TOTAL_MARGIN'])
  commissionBase?: 'MALODGE_MARGIN' | 'TOTAL_MARGIN' | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
