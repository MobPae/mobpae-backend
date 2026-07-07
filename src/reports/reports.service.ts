import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardReport() {
    const [
      totalEmployers,
      activeEmployers,
      suspendedEmployers,
      pendingEmployers,
      totalEmployees,
      activeEmployees,
      pendingKyc,
      pendingBankVerification,
      pendingLoanApplications,
      approvedLoanApplications,
      disbursedLoanApplications,
      totalDisbursed,
      totalRecovered,
      outstanding,
      pendingSettlements,
      membershipTotals,
    ] = await Promise.all([
      this.prisma.employer.count(),
      this.prisma.employer.count({
        where: {
          status: 'ACTIVE',
        },
      }),
      this.prisma.employer.count({
        where: {
          status: 'SUSPENDED',
        },
      }),
      this.prisma.employer.count({
        where: {
          status: 'PENDING',
        },
      }),
      this.prisma.employee.count(),
      this.prisma.employee.count({
        where: {
          employmentStatus: 'ACTIVE',
        },
      }),
      this.prisma.kycDocument.count({
        where: {
          status: 'PENDING',
        },
      }),
      this.prisma.employeeBankAccount.count({
        where: {
          verified: false,
        },
      }),
      this.prisma.loanApplication.count({
        where: {
          status: 'SUBMITTED',
        },
      }),
      this.prisma.loanApplication.count({
        where: {
          status: {
            in: ['EMPLOYER_APPROVED', 'READY_FOR_DISBURSAL'],
          },
        },
      }),
      this.prisma.loanApplication.count({
        where: {
          status: {
            in: ['DISBURSED', 'REPAYMENT_SCHEDULED', 'REPAID'],
          },
        },
      }),
      this.prisma.disbursal.aggregate({
        where: {
          status: 'DISBURSED',
        },
        _sum: {
          disbursedAmount: true,
        },
      }),
      this.prisma.repayment.aggregate({
        where: {
          status: 'PAID',
        },
        _sum: {
          totalAmount: true,
        },
      }),
      this.prisma.repayment.aggregate({
        where: {
          status: {
            in: ['SCHEDULED', 'OVERDUE'],
          },
        },
        _sum: {
          totalAmount: true,
        },
      }),
      this.prisma.employerSettlement.count({
        where: {
          status: 'PENDING',
        },
      }),
      this.prisma.membership.aggregate({
        where: {
          status: 'ACTIVE',
        },
        _sum: {
          amount: true,
          discountAmount: true,
        },
      }),
    ]);

    const membershipRevenue =
      this.toNumber(membershipTotals._sum.amount) -
      this.toNumber(membershipTotals._sum.discountAmount);

    return {
      totalEmployers,
      activeEmployers,
      suspendedEmployers,
      pendingEmployers,
      totalEmployees,
      activeEmployees,
      pendingKyc,
      pendingBankVerification,
      pendingLoanApplications,
      approvedLoanApplications,
      disbursedLoanApplications,
      totalDisbursedAmount: this.toNumber(totalDisbursed._sum.disbursedAmount),
      totalRecoveredAmount: this.toNumber(totalRecovered._sum.totalAmount),
      outstandingAmount: this.toNumber(outstanding._sum.totalAmount),
      pendingSettlements,
      membershipRevenue,
    };
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'object' && 'toNumber' in value) {
      return (value as { toNumber: () => number }).toNumber();
    }

    return Number(value);
  }
}
