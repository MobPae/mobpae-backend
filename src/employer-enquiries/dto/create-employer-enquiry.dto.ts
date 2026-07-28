import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeEmailInput } from '../../common/utils/email.util';

export class CreateEmployerEnquiryDto {
  @IsString()
  @MaxLength(200)
  companyName: string;

  @IsString()
  @MaxLength(200)
  contactPerson: string;

  @Transform(({ value }) => normalizeEmailInput(value))
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(30)
  phone: string;

  @IsOptional()
  @IsInt()
  employeeCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
