import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ProcessPaymentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stripeToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
