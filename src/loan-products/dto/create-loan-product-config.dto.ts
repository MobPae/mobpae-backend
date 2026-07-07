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
  maximumAdvancePercentage: number; // 0–100
  minimumAdvanceAmount: number;
  minimumSalaryInHand: number;
  minimumTenureMonths: number;
  requiresKyc: boolean;
  requiresMembership: boolean;
  requiresBankAccount: boolean;
  requiresActiveSelfie: boolean;
  maxRequestsPerCycle: number;
  cooldownDays: number;
}

export interface PricingRules {
  annualInterestRate: number; // e.g. 36 = 36% p.a.
  interestFreePercentage: number; // 0–100
  processingFeeRate: number; // fraction e.g. 0.01 = 1%
  gstRate: number; // fraction e.g. 0.18 = 18%
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
      maximumAdvancePercentage: 50,
      minimumAdvanceAmount: 1000,
      minimumSalaryInHand: 10000,
      minimumTenureMonths: 3,
      requiresKyc: true,
      requiresMembership: true,
      requiresBankAccount: true,
      requiresActiveSelfie: true,
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
      interestFreePercentage: 0,
      processingFeeRate: 0,
      gstRate: 0,
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
