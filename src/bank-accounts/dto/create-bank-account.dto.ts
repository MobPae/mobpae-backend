import { IsOptional, IsString } from 'class-validator';

export class CreateBankAccountDto {
  @IsString()
  employeeId: string;

  @IsString()
  accountHolderName: string;

  @IsString()
  accountNumber: string;

  @IsString()
  ifscCode: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  upiId?: string;
}
