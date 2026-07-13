import { IsEmail, IsInt, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeEmailInput } from '../../common/utils/email.util';

export class CreateEmployerEnquiryDto {
  @IsString()
  companyName: string;

  @IsString()
  contactPerson: string;

  @Transform(({ value }) => normalizeEmailInput(value))
  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsInt()
  employeeCount?: number;
}
