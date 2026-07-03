import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelSalaryRequestDto {
  @ApiPropertyOptional({ example: 'Submitted by mistake' })
  @IsOptional()
  @IsString()
  remarks?: string;
}
