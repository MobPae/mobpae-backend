import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REQUIRED_KYC_DOCUMENTS } from '../common/constants/kyc.constants';
import { EligibilityRules } from '../loan-products/dto/create-loan-product-config.dto';
import { PayrollUtil } from '../common/utils/payroll.util';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EligibilityChecks {
  /** Employee's employer has the SA product enabled */
  productEnabled: boolean;
  kycComplete: boolean;
  bankVerified: boolean;
  noActiveApplication: boolean;
  cooldownMet: boolean;
  withinCycleLimit: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  /** Human-readable reason for ineligibility; null when eligible. */
  reason: string | null;
  checks: EligibilityChecks;
  /** Maximum amount the employee can request right now (0 if ineligible). */
  availableAmount: number;
  /**
   * Effective borrowing ceiling for this employee:
   *   - employer override exists → min(override, salary × hardCeilingPercentage%)
   *   - no override             → min(salary × platformAdvancePercentage%, platformMaxAdvanceAmount)
   */
  maximumEligibleAmount: number;
  /** Platform cap = interest-free threshold = min(salary × platformAdvancePercentage%, platformMaxAdvanceAmount) */
  interestFreeThreshold: number;
}

// Active statuses — an application in any of these blocks a new submission.
const ACTIVE_STATUSES = [
  'SUBMITTED',
  'EMPLOYER_APPROVED',
  'AWAITING_PLATFORM_FEE_PAYMENT',
  'READY_FOR_DISBURSAL',
  'DISBURSED',
  'REPAYMENT_SCHEDULED',
] as const;

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class EligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run all eligibility checks for an employee.
   *
   * @param employeeId      Internal Employee.id
   * @param requestedAmount Optional — if provided, also validates amount ≤ available.
   */
  async check(
    employeeId: string,
    requestedAmount?: number,
  ): Promise<EligibilityResult> {
    const [
      employee,
      kycDocuments,
      bankAccount,
      activeApps,
      recentRepaid,
    ] = await Promise.all([
      this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: {
          id: true,
          userId: true,
          employerId: true,
          salaryInHand: true,
          employer: {
            select: {
              payrollCutoffDate: true,
              payrollDate: true,
            },
          },
        },
      }),
      this.prisma.kycDocument.findMany({ where: { employeeId } }),
      this.prisma.employeeBankAccount.findUnique({ where: { employeeId } }),
      this.prisma.loanApplication.findMany({
        where: { employeeId, status: { in: [...ACTIVE_STATUSES] } },
        select: {
          requestedAmount: true,
          employerApprovedAmount: true,
          adminApprovedAmount: true,
        },
      }),
      this.prisma.loanApplication.findMany({
        where: { employeeId, status: 'REPAID' },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: { updatedAt: true },
      }),
    ]);

    if (!employee) {
      return this.deny('Employee not found', falseChecks(), 0, 0);
    }

    // ── Load product config + employer config in parallel ────────────────────
    const [activeConfig, employerConfig] = await Promise.all([
      this.prisma.loanProductConfig.findFirst({
        where: { product: { productType: 'SA' }, isActive: true },
      }),
      this.prisma.employerProductConfig.findFirst({
        where: {
          employerId: employee.employerId,
          product: { productType: 'SA' },
        },
      }),
    ]);

    // ── Product enabled check ────────────────────────────────────────────────
    const productEnabled = employerConfig?.isEnabled !== false;

    // ── Compute limits ───────────────────────────────────────────────────────
    const salary = Number(employee.salaryInHand);
    const rules = (activeConfig?.eligibilityRules ??
      {}) as Partial<EligibilityRules>;

    const platformAdvancePercentage = rules.platformAdvancePercentage ?? 10;
    const platformMaxAdvanceAmount = rules.platformMaxAdvanceAmount ?? 5000;
    const hardCeilingPercentage = rules.hardCeilingPercentage ?? 50;

    // Interest-free threshold = platform cap (always platform-computed, never employer-overridden)
    const interestFreeThreshold = Math.min(
      salary * (platformAdvancePercentage / 100),
      platformMaxAdvanceAmount,
    );

    // Hard ceiling: salary × 50%
    const hardCeiling = salary * (hardCeilingPercentage / 100);

    // Effective borrowing limit
    // Priority: percentage override → absolute ₹ override → platform default
    const employerPctOverride =
      (employerConfig as any)?.maximumAdvancePercentageOverride != null
        ? Number((employerConfig as any).maximumAdvancePercentageOverride)
        : null;
    const employerAmtOverride =
      employerConfig?.maximumAdvanceAmountOverride ?? null;

    const maximumEligibleAmount =
      employerPctOverride !== null
        ? Math.min(salary * (employerPctOverride / 100), hardCeiling)
        : employerAmtOverride !== null
          ? Math.min(employerAmtOverride, hardCeiling)
          : interestFreeThreshold; // no override → platform cap is the limit

    // Active exposure is calculated before gates so ineligible responses still
    // show the real remaining limit instead of briefly flashing zero in the app.
    const usedAmount = activeApps.reduce((sum, a) => {
      return (
        sum +
        Number(
          a.adminApprovedAmount ??
            a.employerApprovedAmount ??
            a.requestedAmount,
        )
      );
    }, 0);
    const availableAmount = Math.max(0, maximumEligibleAmount - usedAmount);

    // ── Cycle / cooldown params ──────────────────────────────────────────────
    const cooldownDays = rules.cooldownDays ?? 0;
    const maxRequestsPerCycle = rules.maxRequestsPerCycle ?? 1;

    // ── Individual checks ────────────────────────────────────────────────────
    const kycComplete = REQUIRED_KYC_DOCUMENTS.every((type) =>
      kycDocuments.some(
        (d) => d.documentType === type && d.status === 'VERIFIED',
      ),
    );

    const bankVerified = !!bankAccount?.verified;
    const noActiveApplication = activeApps.length === 0;

    // Cooldown: days since last REPAID application
    let cooldownMet = true;
    if (cooldownDays > 0 && recentRepaid.length > 0) {
      const daysSinceLast = Math.floor(
        (Date.now() - recentRepaid[0].updatedAt.getTime()) / 86_400_000,
      );
      cooldownMet = daysSinceLast >= cooldownDays;
    }

    // Cycle limit follows the employer payroll cycle, not the calendar month.
    // The recovery date already accounts for cutoff: on/after cutoff belongs
    // to the next payroll cycle.
    const recoveryDate = PayrollUtil.calculateDueDate(
      new Date(),
      employee.employer?.payrollCutoffDate ?? 20,
      employee.employer?.payrollDate ?? 28,
    );
    const cycleStart = this.getPayrollCycleStart(recoveryDate);
    const nextCycleStart = this.getNextPayrollCycleStart(cycleStart);
    const repaidThisCycle = await this.prisma.loanApplication.count({
      where: {
        employeeId,
        status: 'REPAID',
        OR: [
          { snapshotPayrollCycle: cycleStart },
          {
            snapshotPayrollCycle: null,
            snapshotRecoveryDate: { gte: cycleStart, lt: nextCycleStart },
          },
        ],
      },
    });
    const withinCycleLimit = repaidThisCycle < maxRequestsPerCycle;

    const checks: EligibilityChecks = {
      productEnabled,
      kycComplete,
      bankVerified,
      noActiveApplication,
      cooldownMet,
      withinCycleLimit,
    };

    // ── Gate in priority order ───────────────────────────────────────────────
    if (!productEnabled)
      return this.deny(
        'Salary advance product not enabled for your employer',
        checks,
        maximumEligibleAmount,
        interestFreeThreshold,
        availableAmount,
      );
    if (!kycComplete)
      return this.deny(
        'KYC documents not fully verified',
        checks,
        maximumEligibleAmount,
        interestFreeThreshold,
        availableAmount,
      );
    if (!bankVerified)
      return this.deny(
        'Bank account not verified',
        checks,
        maximumEligibleAmount,
        interestFreeThreshold,
        availableAmount,
      );
    if (!noActiveApplication)
      return this.deny(
        'Active loan application already exists',
        checks,
        maximumEligibleAmount,
        interestFreeThreshold,
        availableAmount,
      );
    if (!cooldownMet)
      return this.deny(
        `Cooldown of ${cooldownDays} days not yet met since last repayment`,
        checks,
        maximumEligibleAmount,
        interestFreeThreshold,
        availableAmount,
      );
    if (!withinCycleLimit)
      return this.deny(
        `Maximum ${maxRequestsPerCycle} request(s) per cycle already reached`,
        checks,
        maximumEligibleAmount,
        interestFreeThreshold,
        availableAmount,
      );

    if (availableAmount <= 0) {
      return this.deny(
        'No available advance amount',
        checks,
        maximumEligibleAmount,
        interestFreeThreshold,
      );
    }

    if (requestedAmount !== undefined && requestedAmount > availableAmount) {
      return this.deny(
        `Requested ₹${requestedAmount} exceeds available ₹${availableAmount}`,
        checks,
        maximumEligibleAmount,
        interestFreeThreshold,
        availableAmount,
      );
    }

    return {
      eligible: true,
      reason: null,
      checks,
      availableAmount,
      maximumEligibleAmount,
      interestFreeThreshold,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private deny(
    reason: string,
    checks: EligibilityChecks,
    maximumEligibleAmount: number,
    interestFreeThreshold: number,
    availableAmount = 0,
  ): EligibilityResult {
    return {
      eligible: false,
      reason,
      checks,
      availableAmount,
      maximumEligibleAmount,
      interestFreeThreshold,
    };
  }

  private getPayrollCycleStart(recoveryDate: Date): Date {
    return new Date(recoveryDate.getFullYear(), recoveryDate.getMonth(), 1);
  }

  private getNextPayrollCycleStart(cycleStart: Date): Date {
    return new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, 1);
  }
}

function falseChecks(): EligibilityChecks {
  return {
    productEnabled: false,
    kycComplete: false,
    bankVerified: false,
    noActiveApplication: false,
    cooldownMet: false,
    withinCycleLimit: false,
  };
}
