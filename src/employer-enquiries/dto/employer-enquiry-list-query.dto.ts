import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmployerEnquiryStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

import { ListQueryDto } from '../../common/dto/list-query.dto';

export class EmployerEnquiryListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: EmployerEnquiryStatus })
  @IsOptional()
  @IsEnum(EmployerEnquiryStatus)
  status?: EmployerEnquiryStatus;
}
