import { IsOptional, IsString } from 'class-validator';

import { ListQueryDto } from '../../common/dto/list-query.dto';

export class AuditLogQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
