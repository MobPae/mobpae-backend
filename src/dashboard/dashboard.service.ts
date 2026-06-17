import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async getAdminDashboard() {
    const [
      totalEmployers,
      activeEmployers,
      totalEmployees,
      pendingKycDocuments,
      pendingSalaryRequests,
      pendingDisbursals,
      activeRepayments,
    ] = await Promise.all([
      this.prisma.employer.count(),
      this.prisma.employer.count({
        where: {
          status: 'ACTIVE',
        },
      }),
      this.prisma.employee.count(),
      this.prisma.kycDocument.count({
        where: {
          status: 'PENDING',
        },
      }),
      this.prisma.salaryRequest.count({
        where: {
          status: 'SUBMITTED',
        },
      }),
      this.prisma.disbursal.count({
        where: {
          status: 'PENDING',
        },
      }),
      this.prisma.repayment.count({
        where: {
          status: 'SCHEDULED',
        },
      }),
    ]);

    return {
      totalEmployers,
      activeEmployers,
      totalEmployees,
      pendingKycDocuments,
      pendingSalaryRequests,
      pendingDisbursals,
      activeRepayments,
    };
  }

  async getEmployerDashboard(userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    return this.getEmployerDashboardByEmployerId(employer.id);
  }

  async getEmployerDashboardByEmployerId(employerId: string) {
    const [
      totalEmployees,
      activeEmployees,
      appActivatedEmployees,

      pendingSalaryRequests,
      approvedRequests,
      disbursedRequests,

      scheduledRecoveries,
      overdueRecoveries,
      recoveryAmount,

      pendingSettlements,
      overdueSettlements,
      settlementAmount,

      recentSalaryRequests,
    ] = await Promise.all([
      /**
       * Employees
       */
      this.prisma.employee.count({
        where: {
          employerId,
        },
      }),

      this.prisma.employee.count({
        where: {
          employerId,
          employmentStatus: 'ACTIVE',
        },
      }),

      this.prisma.employee.count({
        where: {
          employerId,
          appActivated: true,
        },
      }),

      /**
       * Salary Requests
       */
      this.prisma.salaryRequest.count({
        where: {
          employerId,
          status: 'SUBMITTED',
        },
      }),

      this.prisma.salaryRequest.count({
        where: {
          employerId,
          status: 'EMPLOYER_APPROVED',
        },
      }),

      this.prisma.salaryRequest.count({
        where: {
          employerId,
          status: {
            in: ['DISBURSED', 'REPAYMENT_SCHEDULED', 'REPAID'],
          },
        },
      }),

      /**
       * Recoveries
       */
      this.prisma.repayment.count({
        where: {
          salaryRequest: {
            employerId,
          },
          status: 'SCHEDULED',
        },
      }),

      this.prisma.repayment.count({
        where: {
          salaryRequest: {
            employerId,
          },
          status: 'OVERDUE',
        },
      }),

      this.prisma.repayment.aggregate({
        where: {
          salaryRequest: {
            employerId,
          },
          status: {
            in: ['SCHEDULED', 'OVERDUE'],
          },
        },
        _sum: {
          totalAmount: true,
        },
      }),

      /**
       * Settlements
       */
      this.prisma.employerSettlement.count({
        where: {
          employerId,
          status: 'PENDING',
        },
      }),

      this.prisma.employerSettlement.count({
        where: {
          employerId,
          status: 'OVERDUE',
        },
      }),

      this.prisma.employerSettlement.aggregate({
        where: {
          employerId,
          status: {
            in: ['PENDING', 'OVERDUE', 'PARTIALLY_PAID'],
          },
        },
        _sum: {
          outstandingAmount: true,
        },
      }),

      /**
       * Recent Activity
       */
      this.prisma.salaryRequest.findMany({
        where: {
          employerId,
        },
        include: {
          employee: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 5,
      }),
    ]);

    return {
      employees: {
        total: totalEmployees,
        active: activeEmployees,
        appActivated: appActivatedEmployees,
      },

      salaryRequests: {
        pending: pendingSalaryRequests,
        approved: approvedRequests,
        disbursed: disbursedRequests,
      },

      recoveries: {
        scheduled: scheduledRecoveries,
        overdue: overdueRecoveries,
        amountDue: Number(recoveryAmount._sum?.totalAmount) || 0,
      },

      settlements: {
        pending: pendingSettlements,
        overdue: overdueSettlements,
        outstandingAmount:
          Number(settlementAmount._sum?.outstandingAmount) || 0,
      },

      recentActivity: recentSalaryRequests.map((request) => ({
        id: request.id,
        employeeName: request.employee.name,
        amount: Number(request.amount),
        status: request.status,
        requestedAt: request.createdAt,
      })),
    };
  }

  async getEmployeeDashboard(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const advanceSettings = await this.settingsService.getAdvanceSettings();
    const approvedLimit = this.settingsService.calculateAvailableAdvance(
      Number(employee.salaryInHand),
      advanceSettings,
    );

    const latestRequest = await this.prisma.salaryRequest.findFirst({
      where: {
        employeeId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const repayment = await this.prisma.repayment.findFirst({
      where: {
        salaryRequest: {
          employeeId,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const activeRequest = await this.prisma.salaryRequest.findFirst({
      where: {
        employeeId,
        status: {
          in: [
            'SUBMITTED',
            'EMPLOYER_APPROVED',
            'READY_FOR_DISBURSAL',
            'DISBURSED',
            'REPAYMENT_SCHEDULED',
          ],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const activeRequestAmount = activeRequest
      ? Number(activeRequest.approvedAmount ?? activeRequest.amount)
      : 0;
    const availableAdvance = Math.max(0, approvedLimit - activeRequestAmount);

    const kycDocuments = await this.prisma.kycDocument.findMany({
      where: {
        employeeId,
      },
    });

    const kycCompleted = ['PAN', 'AADHAR', 'SALARY_SLIP'].every((type) =>
      kycDocuments.some(
        (doc) => doc.documentType === type && doc.status === 'VERIFIED',
      ),
    );

    return {
      employeeName: employee?.name,
      kycCompleted,
      approvedLimit,
      activeRequestAmount,
      availableAdvance,
      salaryInHand: Number(employee.salaryInHand),
      advanceSettings,
      activeRequestStatus: latestRequest?.status || null,
      activeRepaymentStatus: repayment?.status || null,
    };
  }

  async getEmployerTrends(userId: string, period: string = 'monthly') {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    const rawData = await this.prisma.$queryRaw<
      {
        month: string;
        requestCount: bigint;
        approvedCount: bigint;
        disbursedCount: bigint;
        requestedAmount: number;
        disbursedAmount: number;
      }[]
    >`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS month,
  
        COUNT(*) AS "requestCount",
  
        COUNT(*) FILTER (
          WHERE status IN (
            'EMPLOYER_APPROVED',
            'READY_FOR_DISBURSAL',
            'DISBURSED',
            'REPAYMENT_SCHEDULED',
            'REPAID'
          )
        ) AS "approvedCount",
  
        COUNT(*) FILTER (
          WHERE status IN (
            'DISBURSED',
            'REPAYMENT_SCHEDULED',
            'REPAID'
          )
        ) AS "disbursedCount",
  
        COALESCE(SUM(amount), 0) AS "requestedAmount",
  
        COALESCE(
          SUM(
            CASE
              WHEN status IN (
                'DISBURSED',
                'REPAYMENT_SCHEDULED',
                'REPAID'
              )
              THEN amount
              ELSE 0
            END
          ),
          0
        ) AS "disbursedAmount"
  
      FROM salary_requests
  
      WHERE "employerId" = ${employer.id}
        AND "createdAt" >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
  
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const months: string[] = [];

    const today = new Date();

    for (let i = 5; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);

      months.push(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      );
    }

    const trends = months.map((month) => {
      const record = rawData.find((item) => item.month === month);

      return {
        month,

        requestCount: Number(record?.requestCount ?? 0),

        approvedCount: Number(record?.approvedCount ?? 0),

        disbursedCount: Number(record?.disbursedCount ?? 0),

        requestedAmount: Number(record?.requestedAmount ?? 0),

        disbursedAmount: Number(record?.disbursedAmount ?? 0),
      };
    });

    return {
      period,
      trends,
    };
  }
}
