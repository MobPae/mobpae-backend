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
      salaryRequest: {
        count: jest
          .fn()
          .mockResolvedValueOnce(5)
          .mockResolvedValueOnce(3)
          .mockResolvedValueOnce(42),
      },
      disbursal: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            amount: decimal(210000),
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
      membership: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            amount: decimal(125000),
            discountAmount: decimal(250),
          },
        }),
      },
    };
    const service = new ReportsService(prisma as any);

    await expect(service.getDashboardReport()).resolves.toEqual({
      totalEmployers: 12,
      activeEmployers: 10,
      suspendedEmployers: 1,
      totalEmployees: 250,
      activeEmployees: 230,
      pendingKyc: 18,
      pendingBankVerification: 7,
      pendingSalaryRequests: 5,
      approvedSalaryRequests: 3,
      disbursedSalaryRequests: 42,
      totalDisbursedAmount: 210000,
      totalRecoveredAmount: 180000,
      outstandingAmount: 30000,
      pendingSettlements: 2,
      membershipRevenue: 124750,
    });

    expect(prisma.disbursal.aggregate).toHaveBeenCalledWith({
      where: {
        status: 'DISBURSED',
      },
      _sum: {
        amount: true,
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
    expect(prisma.membership.aggregate).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
      },
      _sum: {
        amount: true,
        discountAmount: true,
      },
    });
  });
});
