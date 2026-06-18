import { ApiPropertyOptional } from '@nestjs/swagger';
import { SalaryRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { ListQueryDto } from '../../common/dto/list-query.dto';

export class SalaryRequestListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: SalaryRequestStatus })
  @IsOptional()
  @IsEnum(SalaryRequestStatus)
  status?: SalaryRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;
}
