import { IsEmail, IsNumber, IsString } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  employerId: string;

  @IsString()
  employeeCode: string;

  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @IsNumber()
  salaryInHand: number;
}
