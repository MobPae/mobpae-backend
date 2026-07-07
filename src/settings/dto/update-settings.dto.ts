import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * Platform-level settings only. Lending rules live in LoanProductConfig.
 */
export class UpdateSettingsDto {
  // Notification toggles
  @IsOptional()
  @IsBoolean()
  loanApplicationAlert?: boolean;

  @IsOptional()
  @IsBoolean()
  repaymentAlert?: boolean;

  @IsOptional()
  @IsBoolean()
  kycAlert?: boolean;

  @IsOptional()
  @IsBoolean()
  bankVerificationAlert?: boolean;

  // Employer settlement
  @IsOptional()
  @IsString()
  EMPLOYER_GRACE_DAYS?: string;

  @IsOptional()
  @IsString()
  EMPLOYER_LATE_FEE_PERCENTAGE?: string;

  // Membership payment info
  @IsOptional()
  @IsString()
  MEMBERSHIP_PAYMENT_UPI_ID?: string;

  @IsOptional()
  @IsString()
  MEMBERSHIP_PAYMENT_BENEFICIARY?: string;

  @IsOptional()
  @IsString()
  MEMBERSHIP_PAYMENT_INSTRUCTIONS?: string;

  // App
  @IsOptional()
  @IsString()
  APP_VERSION?: string;

  @IsOptional()
  @IsBoolean()
  APP_MAINTENANCE_MODE?: boolean;

  @IsOptional()
  @IsString()
  APP_MAINTENANCE_MESSAGE?: string;
}
