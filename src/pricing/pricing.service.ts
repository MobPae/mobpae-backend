import { Injectable } from '@nestjs/common';

// ── Input / Output types ─────────────────────────────────────────────────────

export interface SnapshotInput {
  /** Employee net salary in hand (INR) */
  salaryInHand: number;
  /** Annual interest rate as a percentage, e.g. 36 = 36% p.a. */
  annualInterestRate: number;
  /** Portion of principal that is interest-free (%), e.g. 0 or 50 */
  interestFreePercentage: number;
  /** Processing fee as a decimal fraction, e.g. 0.02 = 2% */
  processingFeeRate: number;
  /** GST rate as a decimal fraction, e.g. 0.18 = 18% */
  gstRate: number;
  /** Max salary advance as a percentage, e.g. 40 = 40% of salary */
  maxAdvancePercentage: number;
  /** Date the loan application is submitted */
  submissionDate: Date;
  /** Employer payroll day-of-month (1–31) */
  payrollDate: number;
  /** Employer payroll cutoff day-of-month (1–31) */
  payrollCutoffDate: number;
}

export interface Snapshot {
  snapshotAnnualInterestRate: number;
  snapshotInterestFreePercentage: number;
  snapshotProcessingFeeRate: number;
  snapshotGstRate: number;
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
      snapshotInterestFreePercentage: input.interestFreePercentage,
      snapshotProcessingFeeRate: input.processingFeeRate,
      snapshotGstRate: input.gstRate,
      snapshotMaxAdvancePercentage: input.maxAdvancePercentage,
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
   *   interestFreeAmount    = principal × interestFreePercentage%
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
      | 'snapshotInterestFreePercentage'
      | 'snapshotProcessingFeeRate'
      | 'snapshotGstRate'
      | 'snapshotInterestDays'
    >,
  ): RepaymentBreakdown {
    const interestFreeAmount = r2(
      disbursedAmount * (snapshot.snapshotInterestFreePercentage / 100),
    );
    const interestBearingAmount = r2(disbursedAmount - interestFreeAmount);
    const interestAmount = r2(
      interestBearingAmount *
        (snapshot.snapshotAnnualInterestRate / 100) *
        (snapshot.snapshotInterestDays / 365),
    );
    const processingFee = r2(disbursedAmount * snapshot.snapshotProcessingFeeRate);
    const gstAmount = r2((interestAmount + processingFee) * snapshot.snapshotGstRate);
    const totalAmount = r2(
      disbursedAmount + interestAmount + processingFee + gstAmount,
    );

    return {
      interestFreeAmount,
      interestBearingAmount,
      interestAmount,
      processingFee,
      gstAmount,
      totalAmount,
    };
  }

  /**
   * Resolve the payroll date on which the advance will be recovered.
   *
   * Rule:
   *   submissionDay <= cutoffDay  → recover on THIS month's payrollDay
   *   submissionDay > cutoffDay   → recover on NEXT month's payrollDay
   */
  resolveRecoveryDate(
    submissionDate: Date,
    payrollDay: number,
    cutoffDay: number,
  ): Date {
    const year = submissionDate.getFullYear();
    const month = submissionDate.getMonth(); // 0-based
    const day = submissionDate.getDate();

    if (day <= cutoffDay) {
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

/** Round to 2 decimal places (banker-safe for INR). */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
