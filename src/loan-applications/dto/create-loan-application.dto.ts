import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
  @ApiProperty({
    example: 15000,
    description: 'Requested amount in INR (whole rupees)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  amount: number;

  @ApiPropertyOptional({
    enum: LoanPurposeCategory,
    example: LoanPurposeCategory.OTHER,
    default: LoanPurposeCategory.OTHER,
    description: 'Defaults to OTHER when not provided (salary advance flow)',
  })
  @IsOptional()
  @IsEnum(LoanPurposeCategory)
  purposeCategory: LoanPurposeCategory = LoanPurposeCategory.OTHER;

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
