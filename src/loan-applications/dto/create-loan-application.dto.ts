import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LoanPurposeCategory } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLoanApplicationDto {
  @ApiProperty({ example: 15000, description: 'Requested amount in INR (whole rupees)' })
  @IsInt()
  @Min(1000)
  amount: number;

  @ApiProperty({ enum: LoanPurposeCategory, example: LoanPurposeCategory.EMERGENCY })
  @IsEnum(LoanPurposeCategory)
  purposeCategory: LoanPurposeCategory;

  @ApiPropertyOptional({ example: 'Medical emergency for family member' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  purposeNote?: string;

  @ApiPropertyOptional({ example: 'Urgent requirement' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}
