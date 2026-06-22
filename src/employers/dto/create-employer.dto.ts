import { Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsInt,
  Max,
  Min,
} from 'class-validator';

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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  payrollDate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  payrollCutoffDate?: number;

  @IsOptional()
  @IsString()
  employerEnquiryId?: string;
}
