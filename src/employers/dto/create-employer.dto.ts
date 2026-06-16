import { IsEmail, IsOptional, IsString, IsInt } from 'class-validator';

export class CreateEmployerDto {
  @IsString()
  companyName: string;

  @IsString()
  companyCode: string;

  @IsString()
  contactPerson: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsInt()
  payrollDate?: number;

  @IsOptional()
  @IsInt()
  payrollCutoffDate?: number;
}
