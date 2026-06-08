import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

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
      outstandingAmount,
    ] = await Promise.all([
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

      this.prisma.repayment.aggregate({
        where: {
          salaryRequest: {
            employerId,
          },
          status: 'SCHEDULED',
        },
        _sum: {
          totalAmount: true,
        },
      }),
    ]);

    return {
      totalEmployees,
      activeEmployees,
      appActivatedEmployees,
      pendingSalaryRequests,
      approvedRequests,

      outstandingAmount: Number(outstandingAmount._sum?.totalAmount) || 0,
    };
  }

  async getEmployeeDashboard(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });

    const salaryLimit = await this.prisma.salaryLimit.findUnique({
      where: {
        employeeId,
      },
    });

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
      approvedLimit: salaryLimit?.approvedLimit || 0,
      activeRequestStatus: latestRequest?.status || null,
      activeRepaymentStatus: repayment?.status || null,
    };
  }
}
