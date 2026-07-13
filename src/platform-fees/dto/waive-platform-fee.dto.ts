import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class WaivePlatformFeeDto {
  @ApiPropertyOptional({
    description: 'Internal admin note explaining why the platform fee was waived',
    example: 'Pilot employee approved by support',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}
