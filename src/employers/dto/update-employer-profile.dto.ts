import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class UpdateEmployerProfileDto {
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @IsString()
  @IsNotEmpty()
  contactPerson: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;
}
