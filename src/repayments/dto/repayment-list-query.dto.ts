import { ApiPropertyOptional } from '@nestjs/swagger';
import { RepaymentStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class RepaymentListQueryDto {
  @ApiPropertyOptional({ enum: RepaymentStatus })
  @IsOptional()
  @IsEnum(RepaymentStatus)
  status?: RepaymentStatus;

  @ApiPropertyOptional({
    example: '2026-06-01T00:00:00.000Z',
    description: 'Include repayments due on or after this ISO date.',
  })
  @IsOptional()
  @IsString()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-06-30T23:59:59.999Z',
    description: 'Include repayments due on or before this ISO date.',
  })
  @IsOptional()
  @IsString()
  @IsDateString()
  endDate?: string;
}
