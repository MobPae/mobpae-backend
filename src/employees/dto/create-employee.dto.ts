import { EmployeeStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { normalizeEmailInput } from '../../common/utils/email.util';

export class CreateEmployeeDto {
  @IsString()
  employeeCode: string;

  @IsString()
  name: string;

  @Transform(({ value }) => normalizeEmailInput(value))
  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  salaryInHand: number;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  employmentStatus?: EmployeeStatus;

  @IsOptional()
  @IsBoolean()
  appActivated?: boolean;
}
