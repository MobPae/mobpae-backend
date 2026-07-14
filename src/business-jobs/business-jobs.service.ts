import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { EmployerSettlementsService } from '../employer-settlements/employer-settlements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BusinessJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly employerSettlementsService: EmployerSettlementsService,
  ) {}

  /**
   * Expire SUBMITTED loan applications that have had no action for > 3 days.
   */
  @Cron('30 1 * * *')
  async expireStaleApplications() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 3);

    const stale = await this.prisma.loanApplication.findMany({
      where: { status: 'SUBMITTED', submittedAt: { lt: cutoff } },
      select: { id: true },
    });

    if (stale.length === 0) return { expired: 0 };

    await this.prisma.$transaction([
      this.prisma.loanApplication.updateMany({
        where: { id: { in: stale.map((a) => a.id) } },
        data: { status: 'EXPIRED' },
      }),
      this.prisma.loanApplicationHistory.createMany({
        data: stale.map((application) => ({
          loanApplicationId: application.id,
          previousStatus: 'SUBMITTED',
          newStatus: 'EXPIRED',
          changedBy: null,
          actorRole: 'SYSTEM',
          remarks: 'Application expired after no action for more than 3 days',
        })),
      }),
    ]);

    return { expired: stale.length };
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async markRepaymentsOverdue() {
    const now = new Date();
    const repayments = await this.prisma.repayment.findMany({
      where: {
        dueDate: {
          lt: now,
        },
        status: {
          not: 'PAID',
        },
      },
      include: {
        loanApplication: {
          include: {
            employee: {
              select: {
                id: true,
                userId: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const overdueRepayments = repayments.filter(
      (repayment) => repayment.status !== 'OVERDUE',
    );

    if (overdueRepayments.length === 0) {
      return {
        processed: 0,
      };
    }

    await this.prisma.repayment.updateMany({
      where: {
        id: {
          in: overdueRepayments.map((repayment) => repayment.id),
        },
      },
      data: {
        status: 'OVERDUE',
      },
    });

    await Promise.all(
      overdueRepayments.map(async (repayment) => {
        await this.auditLogsService.log({
          action: 'REPAYMENT_OVERDUE',
          entityType: 'REPAYMENT',
          entityId: repayment.id,
          oldValue: {
            status: repayment.status,
            dueDate: repayment.dueDate.toISOString(),
          },
          newValue: {
            status: 'OVERDUE',
            processedAt: now.toISOString(),
          },
        });

        const userId = repayment.loanApplication.employee.userId;

        if (userId) {
          await this.notificationsService.createSystemNotification(
            userId,
            'Repayment Overdue',
            'Your salary advance repayment is overdue. Please contact your employer for payroll recovery status.',
          );
        }
      }),
    );

    return {
      processed: overdueRepayments.length,
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async markSettlementsOverdue() {
    const now = new Date();
    const settlements = await this.prisma.employerSettlement.findMany({
      where: {
        dueDate: {
          lt: now,
        },
        status: {
          notIn: ['PAID', 'OVERDUE', 'DRAFT', 'CANCELLED'],
        },
      },
      include: {
        employer: {
          include: {
            user: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (settlements.length === 0) {
      return {
        processed: 0,
      };
    }

    await this.prisma.employerSettlement.updateMany({
      where: {
        id: {
          in: settlements.map((settlement) => settlement.id),
        },
      },
      data: {
        status: 'OVERDUE',
      },
    });

    const admins = await this.prisma.user.findMany({
      where: {
        role: 'ADMIN',
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    await Promise.all(
      settlements.flatMap((settlement) => [
        this.auditLogsService.log({
          action: 'SETTLEMENT_OVERDUE',
          entityType: 'SETTLEMENT',
          entityId: settlement.id,
          oldValue: {
            status: settlement.status,
            dueDate: settlement.dueDate.toISOString(),
            employerId: settlement.employerId,
          },
          newValue: {
            status: 'OVERDUE',
            processedAt: now.toISOString(),
          },
        }),
        ...admins.map((admin) =>
          this.notificationsService.createSystemNotification(
            admin.id,
            'Settlement Overdue',
            `${settlement.employer.companyName} has an overdue settlement.`,
          ),
        ),
        this.notificationsService.createSystemNotification(
          settlement.employer.user.id,
          'Settlement Overdue',
          'Your employer settlement is overdue. Please complete payment to avoid account restrictions.',
        ),
      ]),
    );

    return {
      processed: settlements.length,
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async recalculateEmployerRisk() {
    const employers = await this.prisma.employer.findMany({
      select: {
        id: true,
      },
    });

    const results = await Promise.all(
      employers.map((employer) =>
        this.employerSettlementsService.updateEmployerRiskStatus(employer.id),
      ),
    );

    return {
      processed: results.length,
      results,
    };
  }
}
