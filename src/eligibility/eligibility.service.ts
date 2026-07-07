import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REQUIRED_KYC_DOCUMENTS } from '../common/constants/kyc.constants';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EligibilityChecks {
  hasLoanLimit: boolean;
  kycComplete: boolean;
  bankVerified: boolean;
  membershipActive: boolean;
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
  /** Admin-set ceiling (0 if no limit assigned). */
  maximumEligibleAmount: number;
}

// Active statuses — an application in any of these blocks a new submission.
const ACTIVE_STATUSES = [
  'SUBMITTED',
  'EMPLOYER_APPROVED',
  'AWAITING_MEMBERSHIP_PAYMENT',
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
   * @param employeeId  Internal Employee.id
   * @param requestedAmount  Optional — if provided, also validates amount ≤ available.
   */
  async check(
    employeeId: string,
    requestedAmount?: number,
  ): Promise<EligibilityResult> {
    const [employee, kycDocuments, bankAccount, membership, activeApps, recentRepaid] =
      await Promise.all([
        this.prisma.employee.findUnique({
          where: { id: employeeId },
          include: { loanLimit: true },
        }),
        this.prisma.kycDocument.findMany({ where: { employeeId } }),
        this.prisma.employeeBankAccount.findUnique({ where: { employeeId } }),
        this.prisma.membership.findUnique({ where: { employeeId } }),
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
      return this.deny('Employee not found', falseChecks(), 0);
    }

    // ── Individual checks ────────────────────────────────────────────────────

    const hasLoanLimit =
      !!employee.loanLimit &&
      Number(employee.loanLimit.maximumEligibleAmount) > 0;

    const kycComplete = REQUIRED_KYC_DOCUMENTS.every((type) =>
      kycDocuments.some(
        (d) => d.documentType === type && d.status === 'VERIFIED',
      ),
    );

    const bankVerified = !!bankAccount?.verified;

    const membershipActive = membership?.status === 'ACTIVE';

    const noActiveApplication = activeApps.length === 0;

    // Cooldown: days since last REPAID application
    const cooldownDays = employee.loanLimit?.cooldownDays ?? 0;
    let cooldownMet = true;
    if (cooldownDays > 0 && recentRepaid.length > 0) {
      const daysSinceLast = Math.floor(
        (Date.now() - recentRepaid[0].updatedAt.getTime()) / 86_400_000,
      );
      cooldownMet = daysSinceLast >= cooldownDays;
    }

    // Cycle limit: REPAID applications since start of current calendar month
    const maxRequestsPerCycle = employee.loanLimit?.maxRequestsPerCycle ?? 1;
    const cycleStart = new Date();
    cycleStart.setDate(1);
    cycleStart.setHours(0, 0, 0, 0);
    const repaidThisCycle = recentRepaid.filter(
      (r) => r.updatedAt >= cycleStart,
    ).length;
    const withinCycleLimit = repaidThisCycle < maxRequestsPerCycle;

    const checks: EligibilityChecks = {
      hasLoanLimit,
      kycComplete,
      bankVerified,
      membershipActive,
      noActiveApplication,
      cooldownMet,
      withinCycleLimit,
    };

    const maximumEligibleAmount = hasLoanLimit
      ? Number(employee.loanLimit!.maximumEligibleAmount)
      : 0;

    // ── Gate in priority order ───────────────────────────────────────────────

    if (!hasLoanLimit)
      return this.deny('Loan limit not assigned by admin', checks, maximumEligibleAmount);
    if (!kycComplete)
      return this.deny('KYC documents not fully verified', checks, maximumEligibleAmount);
    if (!bankVerified)
      return this.deny('Bank account not verified', checks, maximumEligibleAmount);
    if (!membershipActive)
      return this.deny('Membership not active', checks, maximumEligibleAmount);
    if (!noActiveApplication)
      return this.deny('Active loan application already exists', checks, maximumEligibleAmount);
    if (!cooldownMet)
      return this.deny(
        `Cooldown of ${cooldownDays} days not yet met since last repayment`,
        checks,
        maximumEligibleAmount,
      );
    if (!withinCycleLimit)
      return this.deny(
        `Maximum ${maxRequestsPerCycle} request(s) per cycle already reached`,
        checks,
        maximumEligibleAmount,
      );

    // ── Available amount ─────────────────────────────────────────────────────

    const usedAmount = activeApps.reduce((sum, a) => {
      return (
        sum +
        Number(a.adminApprovedAmount ?? a.employerApprovedAmount ?? a.requestedAmount)
      );
    }, 0);
    const availableAmount = Math.max(0, maximumEligibleAmount - usedAmount);

    if (availableAmount <= 0) {
      return this.deny('No available advance amount', checks, maximumEligibleAmount);
    }

    if (requestedAmount !== undefined && requestedAmount > availableAmount) {
      return this.deny(
        `Requested ₹${requestedAmount} exceeds available ₹${availableAmount}`,
        checks,
        maximumEligibleAmount,
      );
    }

    return {
      eligible: true,
      reason: null,
      checks,
      availableAmount,
      maximumEligibleAmount,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private deny(
    reason: string,
    checks: EligibilityChecks,
    maximumEligibleAmount: number,
  ): EligibilityResult {
    return { eligible: false, reason, checks, availableAmount: 0, maximumEligibleAmount };
  }
}

function falseChecks(): EligibilityChecks {
  return {
    hasLoanLimit: false,
    kycComplete: false,
    bankVerified: false,
    membershipActive: false,
    noActiveApplication: false,
    cooldownMet: false,
    withinCycleLimit: false,
  };
}
