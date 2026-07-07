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
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new BadRequestException('Employer not found');
    }

    const employeesDue = await this.prisma.repayment.count({
      where: {
        status: 'SCHEDULED',
        loanApplication: {
          employee: {
            employerId: employer.id,
          },
        },
      },
    });

    const pendingRecoveries = await this.prisma.repayment.count({
      where: {
        status: 'SCHEDULED',
        loanApplication: {
          employee: {
            employerId: employer.id,
          },
        },
      },
    });

    const completedRecoveries = await this.prisma.repayment.count({
      where: {
        status: 'PAID',
        loanApplication: {
          employee: {
            employerId: employer.id,
          },
        },
      },
    });

    const repayments = await this.prisma.repayment.findMany({
      where: {
        status: 'SCHEDULED',
        loanApplication: {
          employee: {
            employerId: employer.id,
          },
        },
      },
    });

    const totalRecoveryAmount = repayments.reduce(
      (sum, repayment) => sum + Number(repayment.totalAmount),
      0,
    );

    return {
      payrollDate: employer.payrollDate,
      cutoffDate: employer.payrollCutoffDate,
      employeesDue,
      pendingRecoveries,
      completedRecoveries,
      totalRecoveryAmount,
    };
  }

  async getRecoveries(userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new BadRequestException('Employer not found');
    }

    return this.prisma.repayment.findMany({
      where: {
        loanApplication: {
          employee: {
            employerId: employer.id,
          },
        },
      },
      include: {
        loanApplication: {
          include: {
            employee: true,
          },
        },
      },
      orderBy: {
        dueDate: 'asc',
      },
    });
  }

  async processRecovery(employerId: string, actorUserId?: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        id: employerId,
      },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    const today = new Date();

    const payrollMonth = `${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, '0')}`;

    const existingSettlement = await this.prisma.employerSettlement.findUnique({
      where: {
        employerId_payrollMonth: {
          employerId,
          payrollMonth,
        },
      },
    });

    if (existingSettlement) {
      return {
        employerId,
        payrollMonth,
        processedRepayments: 0,
        settlementId: existingSettlement.id,
        settlementAmount: Number(existingSettlement.totalAmount),
        dueDate: existingSettlement.dueDate,
        alreadyProcessed: true,
      };
    }

    const repayments = await this.prisma.repayment.findMany({
      where: {
        status: 'SCHEDULED',
        settlementId: null,
        dueDate: {
          lte: today,
        },
        loanApplication: {
          employee: {
            employerId,
          },
        },
      },
    });

    // No eligible repayments — record a NO_DUES settlement for this month
    if (!repayments.length) {
      const settlement = await this.prisma.employerSettlement.create({
        data: {
          employerId,
          payrollMonth,
          principalAmount: 0,
          interestAmount: 0,
          lateFeeAmount: 0,
          totalAmount: 0,
          outstandingAmount: 0,
          dueDate: new Date(),
          status: 'NO_DUES' as any,
        },
      });
      return {
        employerId,
        payrollMonth,
        processedRepayments: 0,
        settlementId: settlement.id,
        settlementAmount: 0,
        dueDate: settlement.dueDate,
        noDues: true,
      };
    }

    const principalAmount = repayments.reduce(
      (sum, repayment) => sum + Number(repayment.principalAmount),
      0,
    );

    const interestAmount = repayments.reduce(
      (sum, repayment) => sum + Number(repayment.interestAmount),
      0,
    );

    const settlementAmount = principalAmount + interestAmount;

    const { gracePeriodDays: graceDays } =
      await this.settingsPolicy.getEmployerSettlementPolicy();

    const settlementDueDate = new Date(today);

    settlementDueDate.setDate(settlementDueDate.getDate() + graceDays);

    const settlement = await this.prisma.$transaction(async (tx) => {
      const settlement = await tx.employerSettlement.create({
        data: {
          employerId,
          payrollMonth,
          principalAmount,
          interestAmount,
          lateFeeAmount: 0,
          totalAmount: settlementAmount,
          outstandingAmount: settlementAmount,
          dueDate: settlementDueDate,
          status: 'PENDING',
        },
      });

      await tx.repayment.updateMany({
        where: {
          id: {
            in: repayments.map((r) => r.id),
          },
          settlementId: null,
        },
        data: {
          settlementId: settlement.id,
        },
      });

      return settlement;
    });

    await this.auditLogsService.log({
      userId: actorUserId,
      action: 'PAYROLL_RECOVERY_PROCESSED',
      entityType: 'PAYROLL',
      entityId: employerId,
      newValue: {
        employerId,
        payrollMonth,
        repaymentIds: repayments.map((repayment) => repayment.id),
        loanApplicationIds: repayments.map(
          (repayment) => repayment.loanApplicationId,
        ),
        processedRepayments: repayments.length,
      },
    });

    await this.auditLogsService.log({
      userId: actorUserId,
      action: 'SETTLEMENT_GENERATED',
      entityType: 'SETTLEMENT',
      entityId: settlement.id,
      newValue: {
        employerId,
        payrollMonth,
        principalAmount,
        interestAmount,
        totalAmount: settlementAmount,
        outstandingAmount: settlementAmount,
        dueDate: settlementDueDate.toISOString(),
        status: settlement.status,
      },
    });

    return {
      employerId,
      payrollMonth,
      processedRepayments: repayments.length,
      settlementId: settlement.id,
      settlementAmount,
      dueDate: settlementDueDate,
      alreadyProcessed: false,
    };
  }

}
