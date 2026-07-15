import { ReportsService } from './reports.service';

const decimal = (value: number) => ({
  toNumber: () => value,
});

describe('ReportsService', () => {
  it('returns admin dashboard metrics from Prisma aggregate queries', async () => {
    const prisma = {
      employer: {
        count: jest
          .fn()
          .mockResolvedValueOnce(12)
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(1),
      },
      employee: {
        count: jest.fn().mockResolvedValueOnce(250).mockResolvedValueOnce(230),
      },
      kycDocument: {
        count: jest.fn().mockResolvedValue(18),
      },
      employeeBankAccount: {
        count: jest.fn().mockResolvedValue(7),
      },
      loanApplication: {
        count: jest
          .fn()
          .mockResolvedValueOnce(5)
          .mockResolvedValueOnce(3)
          .mockResolvedValueOnce(42),
      },
      disbursal: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            disbursedAmount: decimal(210000),
          },
        }),
      },
      repayment: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({
            _sum: {
              totalAmount: decimal(180000),
            },
          })
          .mockResolvedValueOnce({
            _sum: {
              totalAmount: decimal(30000),
            },
          }),
      },
      employerSettlement: {
        count: jest.fn().mockResolvedValue(2),
      },
      loanApplicationFee: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            amount: decimal(124750),
          },
        }),
      },
    };
    const service = new ReportsService(prisma as any);

    await expect(service.getDashboardReport()).resolves.toEqual({
      totalEmployers: 12,
      activeEmployers: 10,
      suspendedEmployers: 1,
      pendingEmployers: 1,
      totalEmployees: 250,
      activeEmployees: 230,
      pendingKyc: 18,
      pendingBankVerification: 7,
      pendingLoanApplications: 5,
      approvedLoanApplications: 3,
      disbursedLoanApplications: 42,
      totalDisbursedAmount: 210000,
      totalRecoveredAmount: 180000,
      outstandingAmount: 30000,
      pendingSettlements: 2,
      platformFeeRevenue: 124750,
    });

    expect(prisma.disbursal.aggregate).toHaveBeenCalledWith({
      where: {
        status: 'SUCCESS',
      },
      _sum: {
        disbursedAmount: true,
      },
    });
    expect(prisma.repayment.aggregate).toHaveBeenCalledWith({
      where: {
        status: 'PAID',
      },
      _sum: {
        totalAmount: true,
      },
    });
    expect(prisma.loanApplicationFee.aggregate).toHaveBeenCalledWith({
      where: {
        status: 'PAID',
      },
      _sum: {
        amount: true,
      },
    });
  });

  it('returns revenue grouped by employer and employee', async () => {
    const prisma = {
      loanApplicationFee: {
        findMany: jest.fn().mockResolvedValue([
          {
            amount: decimal(175),
            employee: {
              id: 'employee-1',
              name: 'Arjun Sharma',
              employeeCode: 'EMP001',
            },
            employer: {
              id: 'employer-1',
              companyName: 'Northstar Retail Pvt Ltd',
              companyCode: 'NORTHSTAR',
            },
          },
          {
            amount: decimal(175),
            employee: {
              id: 'employee-2',
              name: 'Maya Rao',
              employeeCode: 'EMP002',
            },
            employer: {
              id: 'employer-1',
              companyName: 'Northstar Retail Pvt Ltd',
              companyCode: 'NORTHSTAR',
            },
          },
        ]),
      },
      repayment: {
        findMany: jest.fn().mockResolvedValue([
          {
            interestAmount: decimal(250),
            loanApplication: {
              employee: {
                id: 'employee-1',
                name: 'Arjun Sharma',
                employeeCode: 'EMP001',
              },
              employer: {
                id: 'employer-1',
                companyName: 'Northstar Retail Pvt Ltd',
                companyCode: 'NORTHSTAR',
              },
            },
          },
        ]),
      },
      employerSettlement: {
        findMany: jest.fn().mockResolvedValue([
          {
            lateFeeAmount: decimal(325),
            employer: {
              id: 'employer-1',
              companyName: 'Northstar Retail Pvt Ltd',
              companyCode: 'NORTHSTAR',
            },
          },
        ]),
      },
      employer: {
        findUnique: jest.fn(),
      },
      employee: {
        groupBy: jest.fn().mockResolvedValue([
          {
            employerId: 'employer-1',
            _count: {
              _all: 3,
            },
          },
        ]),
      },
    };
    const service = new ReportsService(prisma as any);

    await expect(
      service.getRevenueReport({
        startDate: '2026-07-01',
        endDate: '2026-07-31',
      }),
    ).resolves.toEqual({
      totalRevenue: 925,
      interestRevenue: 250,
      platformFeeRevenue: 350,
      lateFeeRevenue: 325,
      byEmployer: [
        {
          employerId: 'employer-1',
          companyName: 'Northstar Retail Pvt Ltd',
          companyCode: 'NORTHSTAR',
          interestRevenue: 250,
          platformFeeRevenue: 350,
          lateFeeRevenue: 325,
          totalRevenue: 925,
          employeeCount: 3,
          employees: [
            {
              employeeId: 'employee-1',
              name: 'Arjun Sharma',
              employeeCode: 'EMP001',
              interestRevenue: 250,
              platformFeeRevenue: 175,
              lateFeeRevenue: 0,
              totalRevenue: 425,
            },
            {
              employeeId: 'employee-2',
              name: 'Maya Rao',
              employeeCode: 'EMP002',
              interestRevenue: 0,
              platformFeeRevenue: 175,
              lateFeeRevenue: 0,
              totalRevenue: 175,
            },
          ],
        },
      ],
    });

    const dateRange = {
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lte: new Date('2026-07-31T23:59:59.999Z'),
    };

    expect(prisma.loanApplicationFee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PAID',
          paidAt: dateRange,
        },
      }),
    );
    expect(prisma.repayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PAID',
          paidDate: dateRange,
        },
      }),
    );
    expect(prisma.employerSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PAID',
          paidDate: dateRange,
        },
      }),
    );
  });
});
