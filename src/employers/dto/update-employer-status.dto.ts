import { IsEnum } from 'class-validator';

import { EmployerStatus } from '@prisma/client';

export class UpdateEmployerStatusDto {
  @IsEnum(EmployerStatus)
  status: EmployerStatus;
}
