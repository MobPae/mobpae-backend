import { IsEmail, IsEnum } from 'class-validator';
import { EmployerRole } from '@prisma/client';

export class CreateInviteDto {
  @IsEmail()
  email: string;

  @IsEnum(EmployerRole)
  role: EmployerRole;
}
