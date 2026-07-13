import { ApiPropertyOptional } from '@nestjs/swagger';
import { LoanApplicationFeeStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { ListQueryDto } from '../../common/dto/list-query.dto';

export class PlatformFeeListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: LoanApplicationFeeStatus })
  @IsOptional()
  @IsEnum(LoanApplicationFeeStatus)
  status?: LoanApplicationFeeStatus;

  @ApiPropertyOptional({ description: 'Filter by employer ID' })
  @IsOptional()
  @IsString()
  employerId?: string;

  @ApiPropertyOptional({ description: 'Filter by employee ID' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Filter by loan application ID' })
  @IsOptional()
  @IsString()
  loanApplicationId?: string;
}
