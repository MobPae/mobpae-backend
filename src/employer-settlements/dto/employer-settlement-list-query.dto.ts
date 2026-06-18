import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmployerSettlementStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { ListQueryDto } from '../../common/dto/list-query.dto';

export class EmployerSettlementListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: EmployerSettlementStatus })
  @IsOptional()
  @IsEnum(EmployerSettlementStatus)
  status?: EmployerSettlementStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employerId?: string;
}
