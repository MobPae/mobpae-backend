import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// ── Input / Output types ─────────────────────────────────────────────────────

export interface SnapshotInput {
  /** Employee net salary in hand (INR) */
  salaryInHand: number;
  /** Annual interest rate as a percentage, e.g. 36 = 36% p.a. */
  annualInterestRate: number;
  /**
   * Absolute ₹ threshold below which no interest is charged.
   * Computed at submission as: min(salary × platformAdvancePercentage%, platformMaxAdvanceAmount)
   * This is the PLATFORM cap — never the employer override amount.
   */
  interestFreeThreshold: number;
  /** Processing fee as a decimal fraction, e.g. 0.02 = 2% */
  processingFeeRate: number;
  /** GST rate as a decimal fraction, e.g. 0.18 = 18% */
  gstRate: number;
  /** Hard ceiling % used (for snapshot record-keeping only) */
  hardCeilingPercentage: number;
  /** Date the loan application is submitted */
  submissionDate: Date;
  /** Employer payroll day-of-month (1–31) */
  payrollDate: number;
  /** Employer payroll cutoff day-of-month (1–31) */
  payrollCutoffDate: number;
}

export interface Snapshot {
  snapshotAnnualInterestRate: number;
  /** Absolute ₹ interest-free threshold frozen at submission */
  snapshotInterestFreeThreshold: number;
  snapshotProcessingFeeRate: number;
  snapshotGstRate: number;
  /** Hard ceiling % stored for reference */
  snapshotMaxAdvancePercentage: number;
  snapshotSalaryInHand: number;
  snapshotInterestDays: number;
  snapshotRecoveryDate: Date;
}

export interface RepaymentBreakdown {
  interestFreeAmount: number;
  interestBearingAmount: number;
  interestAmount: number;
  processingFee: number;
  gstAmount: number;
  totalAmount: number;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PricingService {
  /**
   * Freeze all rate/fact fields at loan submission time.
   * The returned object maps 1-to-1 to LoanApplication snapshot columns.
   * Must never be called again at disbursal — use the frozen DB values instead.
   */
  computeSnapshot(input: SnapshotInput): Snapshot {
    const recoveryDate = this.resolveRecoveryDate(
      input.submissionDate,
      input.payrollDate,
      input.payrollCutoffDate,
    );
    const interestDays = this.daysBetween(input.submissionDate, recoveryDate);

    return {
      snapshotAnnualInterestRate: input.annualInterestRate,
      snapshotInterestFreeThreshold: input.interestFreeThreshold,
      snapshotProcessingFeeRate: input.processingFeeRate,
      snapshotGstRate: input.gstRate,
      snapshotMaxAdvancePercentage: input.hardCeilingPercentage,
      snapshotSalaryInHand: input.salaryInHand,
      snapshotInterestDays: interestDays,
      snapshotRecoveryDate: recoveryDate,
    };
  }

  /**
   * Compute the repayment breakdown from a disbursed amount and frozen snapshot.
   * Called at disbursal time — reads snapshot columns from DB, not live config.
   *
   * Formula:
   *   interestFreeAmount    = min(principal, interestFreeThreshold)
   *   interestBearingAmount = principal − interestFreeAmount
   *   interestAmount        = interestBearingAmount × annualRate% × days/365
   *   processingFee         = principal × processingFeeRate
   *   gstAmount             = (interestAmount + processingFee) × gstRate
   *   totalAmount           = principal + interestAmount + processingFee + gstAmount
   */
  computeRepaymentBreakdown(
    disbursedAmount: number,
    snapshot: Pick<
      Snapshot,
      | 'snapshotAnnualInterestRate'
      | 'snapshotInterestFreeThreshold'
      | 'snapshotProcessingFeeRate'
      | 'snapshotGstRate'
      | 'snapshotInterestDays'
    >,
  ): RepaymentBreakdown {
    // Decimal (not float) math throughout — Prisma.Decimal is the same
    // decimal.js instance Prisma uses for Decimal(12,2) columns, so this
    // matches exactly what gets persisted with no float-rounding drift.
    const principal = new Prisma.Decimal(disbursedAmount);
    const interestFreeAmount = Prisma.Decimal.min(
      principal,
      snapshot.snapshotInterestFreeThreshold,
    ).toDecimalPlaces(2);
    const interestBearingAmount = principal
      .minus(interestFreeAmount)
      .toDecimalPlaces(2);
    const interestAmount = interestBearingAmount
      .times(snapshot.snapshotAnnualInterestRate)
      .dividedBy(100)
      .times(snapshot.snapshotInterestDays)
      .dividedBy(365)
      .toDecimalPlaces(2);
    const processingFee = principal
      .times(snapshot.snapshotProcessingFeeRate)
      .toDecimalPlaces(2);
    const gstAmount = interestAmount
      .plus(processingFee)
      .times(snapshot.snapshotGstRate)
      .toDecimalPlaces(2);
    const totalAmount = principal
      .plus(interestAmount)
      .plus(processingFee)
      .plus(gstAmount)
      .toDecimalPlaces(2);

    return {
      interestFreeAmount: interestFreeAmount.toNumber(),
      interestBearingAmount: interestBearingAmount.toNumber(),
      interestAmount: interestAmount.toNumber(),
      processingFee: processingFee.toNumber(),
      gstAmount: gstAmount.toNumber(),
      totalAmount: totalAmount.toNumber(),
    };
  }

  /**
   * Resolve the payroll date on which the advance will be recovered.
   *
   * Rule:
   *   submissionDay < cutoffDay  → recover on THIS month's payrollDay
   *   submissionDay >= cutoffDay → recover on NEXT month's payrollDay
   */
  resolveRecoveryDate(
    submissionDate: Date,
    payrollDay: number,
    cutoffDay: number,
  ): Date {
    const year = submissionDate.getFullYear();
    const month = submissionDate.getMonth(); // 0-based
    const day = submissionDate.getDate();

    if (day < cutoffDay) {
      return new Date(year, month, payrollDay);
    }
    return new Date(year, month + 1, payrollDay);
  }

  /**
   * Calendar days between submission and recovery (minimum 1).
   */
  daysBetween(from: Date, to: Date): number {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY));
  }
}
