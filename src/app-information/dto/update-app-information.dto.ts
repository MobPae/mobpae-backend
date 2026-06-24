import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateAppInformationDto {
  @ApiPropertyOptional({ example: 'About MobPae' })
  @IsString()
  @MinLength(1)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ example: 'MobPae is a salary advance platform...' })
  @IsString()
  @MinLength(1)
  @IsOptional()
  content?: string;

  @ApiPropertyOptional({ example: '1.1.0' })
  @IsString()
  @IsOptional()
  version?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
