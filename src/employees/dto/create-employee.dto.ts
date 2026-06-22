import { IsEmail, IsNumber, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEmployeeDto {
  @IsString()
  employeeCode: string;

  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  salaryInHand: number;
}
