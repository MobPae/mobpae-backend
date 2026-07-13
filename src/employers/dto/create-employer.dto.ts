import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsInt,
  Max,
  Min,
} from 'class-validator';
import { normalizeEmailInput } from '../../common/utils/email.util';

export class CreateEmployerDto {
  @IsString()
  companyName: string;

  @IsString()
  companyCode: string;

  @IsString()
  contactPerson: string;

  @Transform(({ value }) => normalizeEmailInput(value))
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
