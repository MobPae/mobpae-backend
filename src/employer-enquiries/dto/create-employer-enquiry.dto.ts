import { IsEmail, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateEmployerEnquiryDto {
  @IsString()
  companyName: string;

  @IsString()
  contactPerson: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsInt()
  employeeCount?: number;
}
