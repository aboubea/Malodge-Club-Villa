import { IsString, IsOptional, IsInt } from 'class-validator';

export class CreateDocumentDto {
  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsString()
  fileUrl: string;

  @IsOptional()
  @IsString()
  villaId?: string;

  @IsOptional()
  @IsInt()
  fileSize?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  textContent?: string;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  villaId?: string;

  @IsOptional()
  @IsInt()
  fileSize?: number;

  @IsOptional()
  @IsString()
  category?: string;
}
