import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { SettingsPolicyService } from '../settings/settings-policy.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsPolicy: SettingsPolicyService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async getSummary(userId: string) {
    const employer = await this.prisma.employer.findUnique({ where: { userId } });
    if (!employer) throw new BadRequestException('Employer not found');

    const employeesDue = await this.prisma.repayment.count({
      where: {
        status: 'SCHEDULED',
        loanApplication: { employee: { employerId: employer.id } },
      },
    });

    const completedRecoveries = await this.prisma.repayment.count({
      where: {
        status: 'PAID',
        loanApplication: { employee: { employerId: employer.id } },
      },
    });

    const repayments = await this.prisma.repayment.findMany({
      where: {
        status: 'SCHEDULED',
        loanApplication: { employee: { employerId: employer.id } },
      },
    });

    const totalRecoveryAmount = repayments.reduce(
      (sum, r) => sum + Number(r.totalAmount),
      0,
    );

    return {
      payrollDate: employer.payrollDate,
      cutoffDate: employer.payrollCutoffDate,
      employeesDue,
      pendingRecoveries: employeesDue,
      completedRecoveries,
      totalRecoveryAmount,
    };
  }

  /**
   * Returns scheduled (upcoming) salary deductions for the employer's employees.
   * These are repayments that have not yet been collected via a settlement.
   */
  async getUpcomingRecoveries(userId: string) {
    const employer = await this.prisma.employer.findUnique({ where: { userId } });
    if (!employer) throw new BadRequestException('Employer not found');

    return this.prisma.repayment.findMany({
      where: {
        loanApplication: { employee: { employerId: employer.id } },
      },
      include: {
        loanApplication: {
          include: { employee: true },
        },
        settlementLineItem: {
          select: { settlementId: true, status: true },
        },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  // Keep old name as alias for backward compat with existing controller routes
  async getRecoveries(userId: string) {
    return this.getUpcomingRecoveries(userId);
  }

  /**
   * Admin action: generate an EmployerSettlement for a given employer
   * covering all SCHEDULED repayments that haven't been included in a settlement yet.
   *
   * Settlement number format: MPS-{companyCode}-{YYYYMM}-{sequence}
   * Example: MPS-LTIM-202607-0001
   */
  async processRecovery(employerId: string, actorUserId?: string) {
    const employer = await this.prisma.employer.findUnique({
      where: { id: employerId },
    });
    if (!employer) throw new NotFoundException('Employer not found');

    const today = new Date();

    // cycleDate = first day of current month (e.g. 2026-07-01)
    const cycleDate = new Date(today.getFullYear(), today.getMonth(), 1);

    // Check if a settlement already exists for this cycle
    const existingSettlement = await this.prisma.employerSettlement.findUnique({
      where: {
        employerId_cycleDate: { employerId, cycleDate },
      },
    });

    if (existingSettlement) {
      return {
        employerId,
        cycleDate,
        settlementNumber: existingSettlement.settlementNumber,
        processedRepayments: 0,
        settlementId: existingSettlement.id,
        settlementAmount: Number(existingSettlement.totalAmount),
        dueDate: existingSettlement.dueDate,
        alreadyProcessed: true,
      };
    }

    // Find all SCHEDULED repayments for this employer not yet in any settlement
    const repayments = await this.prisma.repayment.findMany({
      where: {
        status: 'SCHEDULED',
        settlementLineItem: null,   // not yet assigned to any settlement
        dueDate: { lte: today },
        loanApplication: { employee: { employerId } },
      },
      include: {
        loanApplication: {
          include: {
            employee: { select: { id: true, employeeCode: true, name: true } },
          },
        },
      },
    });

    // No eligible repayments — nothing to settle this cycle
    if (!repayments.length) {
      return {
        employerId,
        cycleDate,
        processedRepayments: 0,
        settlementId: null,
        settlementAmount: 0,
        noDues: true,
      };
    }

    // Compute totals
    const principalAmount = repayments.reduce(
      (sum, r) => sum + Number(r.principalAmount), 0,
    );
    const interestAmount = repayments.reduce(
      (sum, r) => sum + Number(r.interestAmount), 0,
    );
    const processingFeeAmount = repayments.reduce(
      (sum, r) => sum + Number(r.processingFee), 0,
    );
    const gstAmount = repayments.reduce(
      (sum, r) => sum + Number(r.gstAmount), 0,
    );
    const totalAmount = principalAmount + interestAmount + processingFeeAmount + gstAmount;

    const { gracePeriodDays: graceDays } =
      await this.settingsPolicy.getEmployerSettlementPolicy();

    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + graceDays);

    const settlement = await this.prisma.$transaction(async (tx) => {
      // Generate settlement number: MPS-{CODE}-{YYYYMM}-{sequence}
      const existingCount = await tx.employerSettlement.count({
        where: { employerId },
      });
      const yyyymm = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
      const settlementNumber = `MPS-${employer.companyCode}-${yyyymm}-${String(existingCount + 1).padStart(4, '0')}`;

      const settlement = await tx.employerSettlement.create({
        data: {
          employerId,
          settlementNumber,
          cycleDate,
          principalAmount,
          interestAmount,
          processingFeeAmount,
          gstAmount,
          lateFeeAmount: 0,
          totalAmount,
          outstandingAmount: totalAmount,
          employeeCount: repayments.length,
          dueDate,
          status: 'GENERATED',
          generatedAt: new Date(),
          generatedBy: actorUserId ?? null,
        },
      });

      // Create frozen SettlementLineItem for each repayment
      await tx.settlementLineItem.createMany({
        data: repayments.map((r) => ({
          settlementId: settlement.id,
          repaymentId: r.id,
          loanApplicationId: r.loanApplicationId,
          employeeId: r.loanApplication.employee.id,
          employeeCode: r.loanApplication.employee.employeeCode,
          employeeName: r.loanApplication.employee.name,
          loanApplicationNumber: r.loanApplication.applicationNumber,
          principalAmount: r.principalAmount,
          interestAmount: r.interestAmount,
          processingFee: r.processingFee,
          gstAmount: r.gstAmount,
          totalDeductionAmount: r.totalAmount,
          status: 'INCLUDED',
        })),
      });

      return settlement;
    });

    await this.auditLogsService.log({
      userId: actorUserId,
      action: 'SETTLEMENT_GENERATED',
      entityType: 'SETTLEMENT',
      entityId: settlement.id,
      newValue: {
        employerId,
        settlementNumber: settlement.settlementNumber,
        cycleDate: cycleDate.toISOString(),
        principalAmount,
        interestAmount,
        processingFeeAmount,
        gstAmount,
        totalAmount,
        employeeCount: repayments.length,
        dueDate: dueDate.toISOString(),
      },
    });

    return {
      employerId,
      cycleDate,
      settlementNumber: settlement.settlementNumber,
      processedRepayments: repayments.length,
      settlementId: settlement.id,
      settlementAmount: totalAmount,
      dueDate,
      alreadyProcessed: false,
    };
  }
}
