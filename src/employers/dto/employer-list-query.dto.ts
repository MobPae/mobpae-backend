import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmployerRiskStatus, EmployerStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

import { ListQueryDto } from '../../common/dto/list-query.dto';

export class EmployerListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: EmployerStatus })
  @IsOptional()
  @IsEnum(EmployerStatus)
  status?: EmployerStatus;

  @ApiPropertyOptional({ enum: EmployerRiskStatus })
  @IsOptional()
  @IsEnum(EmployerRiskStatus)
  riskStatus?: EmployerRiskStatus;
}
