import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/**
 * Mirrors the AppInfoType Prisma enum.
 * Once `prisma generate` is run locally the import can switch to @prisma/client.
 */
export enum AppInfoType {
  ABOUT = 'ABOUT',
  PRIVACY_POLICY = 'PRIVACY_POLICY',
  TERMS_CONDITIONS = 'TERMS_CONDITIONS',
  HOW_IT_WORKS = 'HOW_IT_WORKS',
  FAQ = 'FAQ',
  CONTACT = 'CONTACT',
  WHATS_NEW = 'WHATS_NEW',
}

export class CreateAppInformationDto {
  @ApiProperty({ enum: AppInfoType })
  @IsEnum(AppInfoType)
  type: AppInfoType;

  @ApiProperty({ example: 'About MobPae' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({ example: 'MobPae is a salary advance platform...' })
  @IsString()
  @MinLength(1)
  content: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsString()
  @IsOptional()
  version?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
