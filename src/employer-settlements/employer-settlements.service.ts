import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { SettingsPolicyService } from '../settings/settings-policy.service';
import { EmailService } from '../email/email.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  containsSearch,
  getOrderBy,
  getPagination,
  hasSearch,
  paginate,
} from '../common/utils/pagination.util';
import { EmployerSettlementListQueryDto } from './dto/employer-settlement-list-query.dto';

/**
 * Derives the correct settlement status from persisted data.
 * Handles legacy rows where outstandingAmount=0 but status was never updated.
 *   - totalAmount = 0  → NO_DUES  (payroll ran, no advances due that month)
 *   - outstandingAmount = 0, totalAmount > 0  → PAID  (all dues collected)
 *   - otherwise → keep persisted status
 */
function deriveStatus(s: {
  status: string;
  totalAmount: unknown;
  outstandingAmount: unknown;
}): string {
  const total = Number(s.totalAmount);
  const outstanding = Number(s.outstandingAmount);
  if (total === 0) return 'NO_DUES';
  if (outstanding === 0 && s.status !== 'PAID') return 'PAID';
  return s.status;
}

@Injectable()
export class EmployerSettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsPolicy: SettingsPolicyService,
    private readonly emailService: EmailService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Admin
   * View all employer settlements.
   *
   * Used by:
   * - Admin Settlement Dashboard
   * - Settlement Monitoring Screen
   */
  async findAll(query: EmployerSettlementListQueryDto = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const where: any = {
      status: query.status,
      employerId: query.employerId,
      ...(hasSearch(query)
        ? {
            OR: [
              { payrollMonth: containsSearch(query) },
              { referenceNumber: containsSearch(query) },
              {
                employer: {
                  companyName: containsSearch(query),
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employerSettlement.findMany({
        where,
        include: {
          employer: true,
        },
        orderBy: getOrderBy(
          query,
          [
            'payrollMonth',
            'principalAmount',
            'totalAmount',
            'outstandingAmount',
            'dueDate',
            'status',
            'createdAt',
          ],
          'createdAt',
        ),
        skip,
        take,
      }),
      this.prisma.employerSettlement.count({
        where,
      }),
    ]);

    const normalized = data.map((s) => ({ ...s, status: deriveStatus(s) as any }));
    return paginate(normalized, total, page, limit);
  }

  /**
   * Admin
   * View settlement details.
   * Returns:
   * - Settlement information
   * - Employer information
   */
  async findOne(id: string) {
    const settlement = await this.prisma.employerSettlement.findUnique({
      where: {
        id,
      },
      include: {
        employer: true,
        repayments: {
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
        },
      },
    });

    if (!settlement) {
      throw new NotFoundException('Settlement not found');
    }

    return { ...settlement, status: deriveStatus(settlement) as any };
  }

  /**
   * Employer
   * View own settlements
   */
  async findByEmployer(userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new BadRequestException('Employer not found');
    }

    const settlements = await this.prisma.employerSettlement.findMany({
      where: {
        employerId: employer.id,
      },
      orderBy: {
        payrollMonth: 'desc',
      },
    });

    return settlements.map((s) => ({ ...s, status: deriveStatus(s) as any }));
  }

  /**
   * Admin
   * Mark settlement as paid
   */
  async markPaid(id: string, referenceNumber?: string, actorUserId?: string) {
    const settlement = await this.prisma.employerSettlement.findUnique({
      where: {
        id,
      },
      include: {
        repayments: true,
      },
    });

    if (!settlement) {
      throw new NotFoundException('Settlement not found');
    }

    if (settlement.status === 'PAID') {
      return settlement;
    }

    const paidDate = new Date();
    const repaymentIds = settlement.repayments.map((repayment) => repayment.id);
    const loanApplicationIds = settlement.repayments.map(
      (repayment) => repayment.loanApplicationId,
    );

    const { transition, updatedSettlement } = await this.prisma.$transaction(
      async (tx) => {
        const transition = await tx.employerSettlement.updateMany({
          where: {
            id,
            status: {
              not: 'PAID',
            },
          },
          data: {
            status: 'PAID',
            paidDate,
            outstandingAmount: 0,
            referenceNumber,
          },
        });

        if (transition.count > 0 && repaymentIds.length > 0) {
          const salaryRequests = await tx.loanApplication.findMany({
            where: {
              id: {
                in: loanApplicationIds,
              },
            },
            select: {
              id: true,
              status: true,
            },
          });

          await tx.repayment.updateMany({
            where: {
              id: {
                in: repaymentIds,
              },
              status: {
                not: 'PAID',
              },
            },
            data: {
              status: 'PAID',
              paidDate,
            },
          });

          await tx.loanApplication.updateMany({
            where: {
              id: {
                in: loanApplicationIds,
              },
            },
            data: {
              status: 'REPAID',
            },
          });

          await tx.loanApplicationHistory.createMany({
            data: salaryRequests.map((request) => ({
              loanApplicationId: request.id,
              previousStatus: request.status,
              newStatus: 'REPAID',
              changedBy: actorUserId ?? null,
              actorRole: 'ADMIN',
              remarks: 'Employer settlement marked as paid',
            })),
          });
        }

        const updatedSettlement = await tx.employerSettlement.findUnique({
          where: { id },
        });

        return {
          transition,
          updatedSettlement,
        };
      },
    );

    if (!updatedSettlement) {
      throw new NotFoundException('Settlement not found');
    }

    if (transition.count === 0) {
      return updatedSettlement;
    }

    await this.updateEmployerRiskStatus(settlement.employerId);

    await this.auditLogsService.log({
      userId: actorUserId,
      action: 'SETTLEMENT_PAID',
      entityType: 'SETTLEMENT',
      entityId: updatedSettlement.id,
      oldValue: {
        status: settlement.status,
        outstandingAmount: Number(settlement.outstandingAmount),
        paidDate: settlement.paidDate?.toISOString() ?? null,
        referenceNumber: settlement.referenceNumber,
      },
      newValue: {
        status: updatedSettlement.status,
        outstandingAmount: Number(updatedSettlement.outstandingAmount),
        paidDate: updatedSettlement.paidDate?.toISOString() ?? null,
        referenceNumber: updatedSettlement.referenceNumber,
        repaymentIds,
        loanApplicationIds,
      },
    });

    return updatedSettlement;
  }

  async getSummary(userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new BadRequestException('Employer not found');
    }

    const settlements = await this.prisma.employerSettlement.findMany({
      where: {
        employerId: employer.id,
      },
      orderBy: {
        dueDate: 'asc',
      },
    });

    const outstandingAmount = settlements
      .filter((s) => s.status !== 'PAID')
      .reduce(
        (sum, settlement) => sum + Number(settlement.outstandingAmount),
        0,
      );

    const overdueAmount = settlements
      .filter((s) => s.status === 'OVERDUE')
      .reduce(
        (sum, settlement) => sum + Number(settlement.outstandingAmount),
        0,
      );

    const pendingSettlements = settlements.filter(
      (s) => s.status === 'PENDING',
    ).length;

    const paidSettlements = settlements.filter(
      (s) => s.status === 'PAID',
    ).length;

    const nextDueSettlement = settlements.find((s) => s.status !== 'PAID');

    const { gracePeriodDays, lateFeePercentage } =
      await this.settingsPolicy.getEmployerSettlementPolicy();

    let daysRemaining: number | null = null;

    if (nextDueSettlement?.dueDate) {
      daysRemaining = Math.ceil(
        (nextDueSettlement.dueDate.getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      );
    }

    const estimatedLateFeeAmount = Number(
      (outstandingAmount * (lateFeePercentage / 100)).toFixed(2),
    );

    const amountPayableAfterGracePeriod = Number(
      (outstandingAmount + estimatedLateFeeAmount).toFixed(2),
    );

    return {
      outstandingAmount,
      overdueAmount,
      pendingSettlements,
      paidSettlements,
      nextDueDate: nextDueSettlement?.dueDate ?? null,
      gracePeriodDays,
      daysRemaining,
      lateFeePercentage,
      estimatedLateFeeAmount,
      amountPayableAfterGracePeriod,
      riskStatus: employer.riskStatus,
    };
  }

  async updateEmployerRiskStatus(employerId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        id: employerId,
      },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    const { gracePeriodDays: graceDays } =
      await this.settingsPolicy.getEmployerSettlementPolicy();

    const today = new Date();

    const settlements = await this.prisma.employerSettlement.findMany({
      where: {
        employerId,
        status: {
          in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'],
        },
      },
    });

    let riskStatus: 'GOOD' | 'WARNING' | 'BLOCKED' = 'GOOD';

    for (const settlement of settlements) {
      const overdueDate = new Date(settlement.dueDate);

      overdueDate.setDate(overdueDate.getDate() + graceDays);

      if (today > overdueDate) {
        riskStatus = 'BLOCKED';

        await this.prisma.employerSettlement.update({
          where: {
            id: settlement.id,
          },
          data: {
            status: 'OVERDUE',
          },
        });

        break;
      }

      if (today > settlement.dueDate) {
        riskStatus = 'WARNING';
      }
    }

    await this.prisma.employer.update({
      where: {
        id: employerId,
      },
      data: {
        riskStatus,
      },
    });

    return {
      employerId,
      riskStatus,
    };
  }

  async sendReport(id: string, actor?: { role?: string; userId?: string }) {
    const settlement = await this.prisma.employerSettlement.findUnique({
      where: {
        id,
      },
      include: {
        employer: true,
        repayments: {
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
        },
      },
    });

    if (!settlement) {
      throw new NotFoundException('Settlement not found');
    }

    if (
      actor?.role === 'EMPLOYER' &&
      settlement.employer.userId !== actor.userId
    ) {
      throw new ForbiddenException(
        'You can only send reports for your own settlements',
      );
    }

    try {
      await this.emailService.sendSettlementReportEmail({
        to: settlement.employer.email,
        companyName: settlement.employer.companyName,
        payrollMonth: settlement.payrollMonth,
        outstandingAmount: Number(settlement.outstandingAmount),
        settlementId: settlement.id,
        recoveries: settlement.repayments.map((repayment) => ({
          employeeName: repayment.loanApplication.employee.name,
          employeeCode: repayment.loanApplication.employee.employeeCode,
          loanApplicationId: repayment.loanApplicationId,
          principalAmount: Number(repayment.principalAmount),
          interestAmount: Number(repayment.interestAmount),
          totalAmount: Number(repayment.totalAmount),
          dueDate: repayment.dueDate,
        })),
      });
    } catch (error) {
      console.error('Failed to send settlement report email', error);
    }

    return {
      success: true,
      message: 'Settlement report sent successfully',
      settlementId: settlement.id,
      employer: settlement.employer.companyName,
      email: settlement.employer.email,
    };
  }
}
