import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateMembershipPlanConfigDto {
  /**
   * Unique machine-readable key (e.g. 'MONTHLY', 'BIANNUAL', 'ANNUAL').
   * Used as the foreign-key reference in memberships.plan_type.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'planKey must be uppercase letters, digits and underscores only',
  })
  planKey: string;

  /** Human-readable name shown in UI, e.g. 'Monthly', '6 Months' */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  planName: string;

  /** Price in INR */
  @IsNumber()
  @IsPositive()
  amount: number;

  /** How many days the membership stays active after approval */
  @IsInt()
  @Min(1)
  validityDays: number;

  /** Billing frequency label shown in UI, e.g. 'Billed every month' */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  billingLabel: string;

  /** Optional per-month breakdown label, e.g. '= ₹83 / month' */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  perMonthLabel?: string;

  /** Highlight this plan as preferred / recommended */
  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;

  /** Controls display order (ascending). Lower number = shown first. */
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
