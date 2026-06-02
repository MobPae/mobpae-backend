import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBankAccountDto {
  @ApiProperty({
    example: 'Emoloyee ID',
    description: 'Unique identifier for the employee',
  })
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
