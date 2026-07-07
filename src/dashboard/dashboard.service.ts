import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REQUIRED_KYC_DOCUMENTS } from '../common/constants/kyc.constants';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminDashboard() {
    const [
      totalEmployers,
      activeEmployers,
      totalEmployees,
      pendingKycDocuments,
      pendingLoanApplications,
      pendingDisbursals,
      activeRepayments,
    ] = await Promise.all([
      this.prisma.employer.count(),
      this.prisma.employer.count({ where: { status: 'ACTIVE' } }),
      this.prisma.employee.count(),
      this.prisma.kycDocument.count({ where: { status: 'PENDING' } }),
      this.prisma.loanApplication.count({ where: { status: 'SUBMITTED' } }),
      this.prisma.disbursal.count({ where: { status: 'PENDING' } }),
      this.prisma.repayment.count({ where: { status: 'SCHEDULED' } }),
    ]);

    return {
      totalEmployers,
      activeEmployers,
      totalEmployees,
      pendingKycDocuments,
      pendingLoanApplications,
      pendingDisbursals,
      activeRepayments,
    };
  }

  async getEmployerDashboard(userId: string) {
    const employer = await this.prisma.employer.findUnique({ where: { userId } });

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
      pendingApplications,
      approvedApplications,
      disbursedApplications,
      scheduledRecoveries,
      overdueRecoveries,
      recoveryAmount,
      pendingSettlements,
      overdueSettlements,
      settlementAmount,
      recentApplications,
    ] = await Promise.all([
      this.prisma.employee.count({ where: { employerId } }),
      this.prisma.employee.count({
        where: { employerId, employmentStatus: 'ACTIVE' },
      }),
      this.prisma.employee.count({
        where: { employerId, appActivated: true },
      }),

      this.prisma.loanApplication.count({
        where: { employerId, status: 'SUBMITTED' },
      }),
      this.prisma.loanApplication.count({
        where: { employerId, status: 'EMPLOYER_APPROVED' },
      }),
      this.prisma.loanApplication.count({
        where: {
          employerId,
          status: { in: ['DISBURSED', 'REPAYMENT_SCHEDULED', 'REPAID'] },
        },
      }),

      this.prisma.repayment.count({
        where: {
          loanApplication: { employerId },
          status: 'SCHEDULED',
        },
      }),
      this.prisma.repayment.count({
        where: {
          loanApplication: { employerId },
          status: 'OVERDUE',
        },
      }),
      this.prisma.repayment.aggregate({
        where: {
          loanApplication: { employerId },
          status: { in: ['SCHEDULED', 'OVERDUE'] },
        },
        _sum: { totalAmount: true },
      }),

      this.prisma.employerSettlement.count({
        where: { employerId, status: 'PENDING' },
      }),
      this.prisma.employerSettlement.count({
        where: { employerId, status: 'OVERDUE' },
      }),
      this.prisma.employerSettlement.aggregate({
        where: {
          employerId,
          status: { in: ['PENDING', 'OVERDUE', 'PARTIALLY_PAID'] },
        },
        _sum: { outstandingAmount: true },
      }),

      this.prisma.loanApplication.findMany({
        where: { employerId },
        include: { employee: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      employees: {
        total: totalEmployees,
        active: activeEmployees,
        appActivated: appActivatedEmployees,
      },
      loanApplications: {
        pending: pendingApplications,
        approved: approvedApplications,
        disbursed: disbursedApplications,
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
      recentActivity: recentApplications.map((app) => ({
        id: app.id,
        applicationNumber: app.applicationNumber,
        employeeName: app.employee.name,
        requestedAmount: Number(app.requestedAmount),
        status: app.status,
        submittedAt: app.submittedAt,
      })),
    };
  }

  async getEmployeeDashboard(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        employer: {
          select: { payrollDate: true, payrollCutoffDate: true },
        },
        loanLimit: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const maximumEligibleAmount = employee.loanLimit
      ? Number(employee.loanLimit.maximumEligibleAmount)
      : 0;

    const activeApplication = await this.prisma.loanApplication.findFirst({
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
      orderBy: { createdAt: 'desc' },
    });

    const latestApplication = await this.prisma.loanApplication.findFirst({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });

    const repayment = await this.prisma.repayment.findFirst({
      where: { loanApplication: { employeeId } },
      orderBy: { createdAt: 'desc' },
    });

    const activeRequestAmount = activeApplication
      ? Number(
          activeApplication.adminApprovedAmount ??
            activeApplication.employerApprovedAmount ??
            activeApplication.requestedAmount,
        )
      : 0;
    const availableAdvance = Math.max(0, maximumEligibleAmount - activeRequestAmount);

    const kycDocuments = await this.prisma.kycDocument.findMany({
      where: { employeeId },
    });

    const kycCompleted = REQUIRED_KYC_DOCUMENTS.every((type) =>
      kycDocuments.some(
        (doc) => doc.documentType === type && doc.status === 'VERIFIED',
      ),
    );

    return {
      employeeName: employee.name,
      kycCompleted,
      selfieStatus: employee.selfieStatus,
      maximumEligibleAmount,
      activeRequestAmount,
      availableAdvance,
      salaryInHand: Number(employee.salaryInHand),
      activeApplicationStatus: latestApplication?.status ?? null,
      activeRepaymentStatus: repayment?.status ?? null,
      payrollDay: employee.employer?.payrollDate ?? null,
      payrollCutoffDate: employee.employer?.payrollCutoffDate ?? null,
    };
  }

  async getEmployerTrends(userId: string, period: string = 'monthly') {
    const employer = await this.prisma.employer.findUnique({ where: { userId } });

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
        TO_CHAR(DATE_TRUNC('month', "submittedAt"), 'YYYY-MM') AS month,

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

        COALESCE(SUM("requestedAmount"), 0) AS "requestedAmount",

        COALESCE(
          SUM(
            CASE
              WHEN status IN ('DISBURSED', 'REPAYMENT_SCHEDULED', 'REPAID')
              THEN "adminApprovedAmount"
              ELSE 0
            END
          ),
          0
        ) AS "disbursedAmount"

      FROM loan_applications

      WHERE "employerId" = ${employer.id}
        AND "submittedAt" >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'

      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const today = new Date();
    const months: string[] = [];
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

    return { period, trends };
  }
}
