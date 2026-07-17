import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

// ── Typed rule interfaces (matched by LoanProductConfig Json fields) ─────────

export interface EligibilityRules {
  /** Interest-free cap as % of salary, e.g. 10 = 10% (used to compute platform cap) */
  platformAdvancePercentage: number;
  /** Absolute ₹ ceiling for the platform cap, e.g. 5000 */
  platformMaxAdvanceAmount: number;
  /** MVP hard ceiling as % of salary — employee cannot borrow beyond this even with employer override */
  hardCeilingPercentage: number;
  minimumAdvanceAmount: number;
  minimumSalaryInHand: number;
  minimumTenureMonths: number;
  requiresKyc: boolean;
  requiresBankAccount: boolean;
  maxRequestsPerCycle: number;
  cooldownDays: number;
}

export interface PricingRules {
  annualInterestRate: number; // e.g. 36 = 36% p.a.
  processingFeeRate: number; // fraction e.g. 0.01 = 1%
  gstRate: number; // fraction e.g. 0.18 = 18%
  /** Employee-paid per-transaction platform fee after employer approval. */
  platformFeeAmount?: number;
  platformFeeCurrency?: string;
}

export interface OperationalRules {
  requiresEmployerApproval: boolean;
  requiresAdminApproval: boolean;
  minDisbursalDays: number;
  maxDisbursalDays: number;
  defaultFundingSource: 'MOBPAE' | 'EMPLOYER' | 'PARTNER';
}

// ── DTO ──────────────────────────────────────────────────────────────────────

export class CreateLoanProductConfigDto {
  @ApiPropertyOptional({ description: 'Human-readable version label, e.g. "Q3 2026 v2"' })
  @IsOptional()
  @IsString()
  versionName?: string;

  @ApiProperty({ description: 'Date this version becomes effective (ISO 8601)' })
  @IsDateString()
  effectiveFrom: string;

  @ApiProperty({
    description: 'EligibilityRules — governs who can apply',
    example: {
      platformAdvancePercentage: 10,
      platformMaxAdvanceAmount: 5000,
      hardCeilingPercentage: 50,
      minimumAdvanceAmount: 1000,
      minimumSalaryInHand: 10000,
      minimumTenureMonths: 3,
      requiresKyc: true,
      requiresBankAccount: true,
      maxRequestsPerCycle: 1,
      cooldownDays: 0,
    },
  })
  @IsObject()
  eligibilityRules: EligibilityRules;

  @ApiProperty({
    description: 'PricingRules — pure-function inputs for PricingService',
    example: {
      annualInterestRate: 36,
      processingFeeRate: 0,
      gstRate: 0,
      platformFeeAmount: 175,
      platformFeeCurrency: 'INR',
    },
  })
  @IsObject()
  pricingRules: PricingRules;

  @ApiProperty({
    description: 'OperationalRules — workflow controls',
    example: {
      requiresEmployerApproval: true,
      requiresAdminApproval: true,
      minDisbursalDays: 0,
      maxDisbursalDays: 3,
      defaultFundingSource: 'MOBPAE',
    },
  })
  @IsObject()
  operationalRules: OperationalRules;
}
