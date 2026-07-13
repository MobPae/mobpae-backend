import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeEmailInput } from '../../common/utils/email.util';

export class UpdateEmployerProfileDto {
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @IsString()
  @IsNotEmpty()
  contactPerson: string;

  @Transform(({ value }) => normalizeEmailInput(value))
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;
}
