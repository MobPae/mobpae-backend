import { IsEnum } from 'class-validator';
import { EmployerRole } from '@prisma/client';

export class UpdateMemberRoleDto {
  @IsEnum(EmployerRole)
  role: EmployerRole;
}
