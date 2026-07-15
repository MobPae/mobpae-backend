import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RevenueReportQueryDto } from './dto/revenue-report-query.dto';

type RevenueEmployeeBucket = {
  employeeId: string;
  name: string;
  employeeCode: string;
  interestRevenue: number;
  platformFeeRevenue: number;
  lateFeeRevenue: number;
  totalRevenue: number;
};

type RevenueEmployerBucket = {
  employerId: string;
  companyName: string;
  companyCode: string;
  interestRevenue: number;
  platformFeeRevenue: number;
  lateFeeRevenue: number;
  totalRevenue: number;
  employeeCount: number;
  employees: Map<string, RevenueEmployeeBucket>;
};

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
      platformFeeTotals,
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
          status: 'SUCCESS',
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
          status: 'GENERATED',
        },
      }),
      this.prisma.loanApplicationFee.aggregate({
        where: {
          status: 'PAID',
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

    const platformFeeRevenue = this.toNumber(platformFeeTotals._sum.amount);

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
      totalDisbursedAmount: this.toNumber(totalDisbursed._sum?.disbursedAmount),
      totalRecoveredAmount: this.toNumber(totalRecovered._sum.totalAmount),
      outstandingAmount: this.toNumber(outstanding._sum.totalAmount),
      pendingSettlements,
      platformFeeRevenue,
    };
  }

  async getRevenueReport(query: RevenueReportQueryDto = {}) {
    const dateRange = this.buildDateRange(query);
    const employerWhere = query.employerId
      ? { employerId: query.employerId }
      : {};

    const [platformFees, repayments, lateFeeSettlements, filteredEmployer] =
      await Promise.all([
        this.prisma.loanApplicationFee.findMany({
          where: {
            status: 'PAID',
            ...employerWhere,
            ...(dateRange ? { paidAt: dateRange } : {}),
          },
          select: {
            amount: true,
            employee: {
              select: {
                id: true,
                name: true,
                employeeCode: true,
              },
            },
            employer: {
              select: {
                id: true,
                companyName: true,
                companyCode: true,
              },
            },
          },
        }),
        this.prisma.repayment.findMany({
          where: {
            status: 'PAID',
            ...(dateRange ? { paidDate: dateRange } : {}),
            ...(query.employerId
              ? {
                  loanApplication: {
                    employerId: query.employerId,
                  },
                }
              : {}),
          },
          select: {
            interestAmount: true,
            loanApplication: {
              select: {
                employee: {
                  select: {
                    id: true,
                    name: true,
                    employeeCode: true,
                  },
                },
                employer: {
                  select: {
                    id: true,
                    companyName: true,
                    companyCode: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.employerSettlement.findMany({
          where: {
            status: 'PAID',
            ...(query.employerId ? { employerId: query.employerId } : {}),
            ...(dateRange ? { paidDate: dateRange } : {}),
          },
          select: {
            lateFeeAmount: true,
            employer: {
              select: {
                id: true,
                companyName: true,
                companyCode: true,
              },
            },
          },
        }),
        query.employerId
          ? this.prisma.employer.findUnique({
              where: { id: query.employerId },
              select: {
                id: true,
                companyName: true,
                companyCode: true,
              },
            })
          : Promise.resolve(null),
      ]);

    const employers = new Map<string, RevenueEmployerBucket>();

    if (filteredEmployer) {
      this.ensureEmployer(employers, filteredEmployer);
    }

    for (const fee of platformFees) {
      const employer = this.ensureEmployer(employers, fee.employer);
      const employee = this.ensureEmployee(employer, fee.employee);
      const amount = this.toNumber(fee.amount);

      employee.platformFeeRevenue += amount;
      employer.platformFeeRevenue += amount;
    }

    for (const repayment of repayments) {
      const employer = this.ensureEmployer(
        employers,
        repayment.loanApplication.employer,
      );
      const employee = this.ensureEmployee(
        employer,
        repayment.loanApplication.employee,
      );
      const amount = this.toNumber(repayment.interestAmount);

      employee.interestRevenue += amount;
      employer.interestRevenue += amount;
    }

    for (const settlement of lateFeeSettlements) {
      const employer = this.ensureEmployer(employers, settlement.employer);

      // Late fee is stored on EmployerSettlement, not per employee line item.
      // Employee buckets therefore keep lateFeeRevenue at zero.
      employer.lateFeeRevenue += this.toNumber(settlement.lateFeeAmount);
    }

    const employerIds = [...employers.keys()];
    const employeeCounts =
      employerIds.length > 0
        ? await this.prisma.employee.groupBy({
            by: ['employerId'],
            where: {
              employerId: {
                in: employerIds,
              },
            },
            _count: {
              _all: true,
            },
          })
        : [];
    const employeeCountByEmployer = new Map(
      employeeCounts.map((row) => [row.employerId, row._count._all]),
    );

    let interestRevenue = 0;
    let platformFeeRevenue = 0;
    let lateFeeRevenue = 0;

    const byEmployer = [...employers.values()]
      .map((employer) => {
        employer.interestRevenue = this.roundMoney(employer.interestRevenue);
        employer.platformFeeRevenue = this.roundMoney(
          employer.platformFeeRevenue,
        );
        employer.lateFeeRevenue = this.roundMoney(employer.lateFeeRevenue);
        employer.totalRevenue = this.roundMoney(
          employer.interestRevenue +
            employer.platformFeeRevenue +
            employer.lateFeeRevenue,
        );
        employer.employeeCount =
          employeeCountByEmployer.get(employer.employerId) ?? 0;

        interestRevenue += employer.interestRevenue;
        platformFeeRevenue += employer.platformFeeRevenue;
        lateFeeRevenue += employer.lateFeeRevenue;

        return {
          employerId: employer.employerId,
          companyName: employer.companyName,
          companyCode: employer.companyCode,
          interestRevenue: employer.interestRevenue,
          platformFeeRevenue: employer.platformFeeRevenue,
          lateFeeRevenue: employer.lateFeeRevenue,
          totalRevenue: employer.totalRevenue,
          employeeCount: employer.employeeCount,
          employees: [...employer.employees.values()]
            .map((employee) => ({
              ...employee,
              interestRevenue: this.roundMoney(employee.interestRevenue),
              platformFeeRevenue: this.roundMoney(employee.platformFeeRevenue),
              lateFeeRevenue: this.roundMoney(employee.lateFeeRevenue),
              totalRevenue: this.roundMoney(
                employee.interestRevenue +
                  employee.platformFeeRevenue +
                  employee.lateFeeRevenue,
              ),
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        };
      })
      .sort((a, b) => a.companyName.localeCompare(b.companyName));

    interestRevenue = this.roundMoney(interestRevenue);
    platformFeeRevenue = this.roundMoney(platformFeeRevenue);
    lateFeeRevenue = this.roundMoney(lateFeeRevenue);

    return {
      totalRevenue: this.roundMoney(
        interestRevenue + platformFeeRevenue + lateFeeRevenue,
      ),
      interestRevenue,
      platformFeeRevenue,
      lateFeeRevenue,
      byEmployer,
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

  private ensureEmployer(
    employers: Map<string, RevenueEmployerBucket>,
    employer: { id: string; companyName: string; companyCode: string },
  ): RevenueEmployerBucket {
    const existing = employers.get(employer.id);

    if (existing) {
      return existing;
    }

    const bucket: RevenueEmployerBucket = {
      employerId: employer.id,
      companyName: employer.companyName,
      companyCode: employer.companyCode,
      interestRevenue: 0,
      platformFeeRevenue: 0,
      lateFeeRevenue: 0,
      totalRevenue: 0,
      employeeCount: 0,
      employees: new Map(),
    };

    employers.set(employer.id, bucket);

    return bucket;
  }

  private ensureEmployee(
    employer: RevenueEmployerBucket,
    employee: { id: string; name: string; employeeCode: string },
  ): RevenueEmployeeBucket {
    const existing = employer.employees.get(employee.id);

    if (existing) {
      return existing;
    }

    const bucket: RevenueEmployeeBucket = {
      employeeId: employee.id,
      name: employee.name,
      employeeCode: employee.employeeCode,
      interestRevenue: 0,
      platformFeeRevenue: 0,
      lateFeeRevenue: 0,
      totalRevenue: 0,
    };

    employer.employees.set(employee.id, bucket);

    return bucket;
  }

  private buildDateRange(
    query: RevenueReportQueryDto,
  ): Prisma.DateTimeFilter | undefined {
    const range: Prisma.DateTimeFilter = {};

    if (query.startDate) {
      range.gte = this.parseDate(query.startDate, 'startDate', false);
    }

    if (query.endDate) {
      range.lte = this.parseDate(query.endDate, 'endDate', true);
    }

    return Object.keys(range).length > 0 ? range : undefined;
  }

  private parseDate(value: string, field: string, endOfDay: boolean): Date {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = new Date(isDateOnly ? `${value}T00:00:00.000Z` : value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }

    if (isDateOnly && endOfDay) {
      date.setUTCHours(23, 59, 59, 999);
    }

    return date;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
