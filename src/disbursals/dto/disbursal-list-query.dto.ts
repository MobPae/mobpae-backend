import { ApiPropertyOptional } from '@nestjs/swagger';
import { DisbursalStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class DisbursalListQueryDto {
  @ApiPropertyOptional({ enum: DisbursalStatus })
  @IsOptional()
  @IsEnum(DisbursalStatus)
  status?: DisbursalStatus;

  @ApiPropertyOptional({ description: 'Filter by salary request employer.' })
  @IsOptional()
  @IsString()
  employerId?: string;

  @ApiPropertyOptional({ description: 'Filter by salary request employee.' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({
    example: '2026-06-01T00:00:00.000Z',
    description: 'Include disbursals created on or after this ISO date.',
  })
  @IsOptional()
  @IsString()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-06-30T23:59:59.999Z',
    description: 'Include disbursals created on or before this ISO date.',
  })
  @IsOptional()
  @IsString()
  @IsDateString()
  endDate?: string;
}
