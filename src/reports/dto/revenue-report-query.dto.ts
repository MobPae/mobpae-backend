import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class RevenueReportQueryDto {
  @ApiPropertyOptional({
    description: 'Filter revenue for a single employer',
    example: '2f8ed1f2-d5f7-4c5d-88e7-9f8f62b74c68',
  })
  @IsOptional()
  @IsUUID()
  employerId?: string;

  @ApiPropertyOptional({
    description: 'Inclusive start date. Accepts YYYY-MM-DD or ISO datetime.',
    example: '2026-07-01',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Inclusive end date. Accepts YYYY-MM-DD or ISO datetime.',
    example: '2026-07-31',
  })
  @IsOptional()
  @IsString()
  endDate?: string;
}
