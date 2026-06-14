import { IsEmail, IsString, MinLength, IsOptional, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'jean.dupont@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'MotDePasse123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Jean' })
  @IsString()
  @MinLength(1)
  firstName: string;

  @ApiProperty({ example: 'Dupont' })
  @IsString()
  @MinLength(1)
  lastName: string;

  @ApiProperty({ example: '+33612345678', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^[+\d\s\-()]{6,20}$/, { message: 'Numéro de téléphone invalide' })
  phone?: string;
}
