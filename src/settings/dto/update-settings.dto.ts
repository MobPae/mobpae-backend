import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  advancePercentage?: string;

  @IsOptional()
  @IsString()
  interestChargePercentage?: string;

  @IsOptional()
  @IsString()
  processingFeePercentage?: string;

  @IsOptional()
  @IsString()
  minimumSalary?: string;

  @IsOptional()
  @IsString()
  maximumAdvance?: string;

  @IsOptional()
  @IsBoolean()
  requireKyc?: boolean;

  @IsOptional()
  @IsBoolean()
  requireBankVerification?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMultipleRequestsPerCycle?: boolean;

  @IsOptional()
  @IsBoolean()
  allowRequestWithOutstandingBalance?: boolean;

  @IsOptional()
  @IsBoolean()
  salaryRequestAlert?: boolean;

  @IsOptional()
  @IsBoolean()
  repaymentAlert?: boolean;

  @IsOptional()
  @IsBoolean()
  kycAlert?: boolean;

  @IsOptional()
  @IsBoolean()
  bankVerificationAlert?: boolean;

  @IsOptional()
  @IsString()
  membershipPlanName?: string;

  @IsOptional()
  @IsString()
  membershipFee?: string;

  @IsOptional()
  @IsString()
  membershipValidityLabel?: string;

  @IsOptional()
  @IsString()
  membershipCouponCode?: string;

  @IsOptional()
  @IsString()
  membershipCouponDeduction?: string;
}
