import { Type } from 'class-transformer';
import { EmployeeStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  salaryInHand?: number;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  employmentStatus?: EmployeeStatus;
}
