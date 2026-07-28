import { NotificationsService } from './notifications/notifications.service';
import { RepaymentsService } from './repayments/repayments.service';
import { DisbursalsService } from './disbursals/disbursals.service';
import { EmployerSettlementsService } from './employer-settlements/employer-settlements.service';
import { PayrollService } from './payroll/payroll.service';

describe('list and workflow enhancements', () => {
  it('filters admin disbursals by status, ownership, and created-date range', async () => {
    const prisma = {
      disbursal: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;
    const service = new DisbursalsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.findAllForAdmin({
      status: 'DISBURSED',
      employerId: 'employer-1',
      employeeId: 'employee-1',
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-06-30T23:59:59.999Z',
    });

    expect(prisma.disbursal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'DISBURSED',
          createdAt: {
            gte: new Date('2026-06-01T00:00:00.000Z'),
            lte: new Date('2026-06-30T23:59:59.999Z'),
          },
          salaryRequest: {
            employerId: 'employer-1',
            employeeId: 'employee-1',
          },
        },
      }),
    );
  });

  it('filters admin repayments by status and due-date range', async () => {
    const prisma = {
      repayment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;
    const service = new RepaymentsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.findAllForAdmin({
      status: 'OVERDUE',
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-06-30T23:59:59.999Z',
    });

    expect(prisma.repayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'OVERDUE',
          dueDate: {
            gte: new Date('2026-06-01T00:00:00.000Z'),
            lte: new Date('2026-06-30T23:59:59.999Z'),
          },
        },
      }),
    );
  });

  it('returns only the authenticated user unread count', async () => {
    const prisma = {
      notification: {
        count: jest.fn().mockResolvedValue(4),
      },
    } as any;
    const service = new NotificationsService(prisma);

    await expect(service.countUnread('user-1')).resolves.toEqual({ unread: 4 });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false },
    });
  });

  it('returns an already completed disbursal without another transaction', async () => {
    const disbursal = {
      id: 'disbursal-1',
      salaryRequestId: 'request-1',
      status: 'DISBURSED',
    };
    const prisma = {
      disbursal: { findUnique: jest.fn().mockResolvedValue(disbursal) },
      $transaction: jest.fn(),
    } as any;
    const service = new DisbursalsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.disburse('disbursal-1', 'admin-1')).resolves.toEqual(
      disbursal,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns an already paid repayment without repeating payment work', async () => {
    const repayment = { id: 'repayment-1', status: 'PAID' };
    const prisma = {
      repayment: { findUnique: jest.fn().mockResolvedValue(repayment) },
      $transaction: jest.fn(),
    } as any;
    const service = new RepaymentsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.pay('repayment-1')).resolves.toEqual(repayment);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns an existing payroll settlement for a repeated recovery request', async () => {
    const existingSettlement = {
      id: 'settlement-1',
      totalAmount: 5050,
      dueDate: new Date('2026-06-30T00:00:00.000Z'),
    };
    const prisma = {
      employer: {
        findUnique: jest.fn().mockResolvedValue({ id: 'employer-1' }),
      },
      employerSettlement: {
        findUnique: jest.fn().mockResolvedValue(existingSettlement),
      },
      $transaction: jest.fn(),
    } as any;
    const service = new PayrollService(prisma, {} as any, {} as any);

    await expect(
      service.processRecovery('employer-1', 'admin-1'),
    ).resolves.toMatchObject({
      settlementId: 'settlement-1',
      settlementAmount: 5050,
      processedRepayments: 0,
      alreadyProcessed: true,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns an already paid settlement without repeating audit work', async () => {
    const settlement = {
      id: 'settlement-1',
      employerId: 'employer-1',
      status: 'PAID',
    };
    const prisma = {
      employerSettlement: {
        findUnique: jest.fn().mockResolvedValue(settlement),
        updateMany: jest.fn(),
      },
    } as any;
    const audit = { log: jest.fn() };
    const service = new EmployerSettlementsService(
      prisma,
      {} as any,
      {} as any,
      audit as any,
    );

    await expect(
      service.markPaid('settlement-1', 'UTR123', 'admin-1'),
    ).resolves.toEqual(settlement);
    expect(prisma.employerSettlement.updateMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('prevents employers from sending another employer settlement report', async () => {
    const prisma = {
      employerSettlement: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'settlement-1',
          payrollMonth: '2026-06',
          outstandingAmount: 5050,
          employer: {
            userId: 'other-employer-user',
            email: 'finance@example.com',
            companyName: 'Example Ltd',
          },
        }),
      },
    } as any;
    const email = { sendSettlementReportEmail: jest.fn() };
    const service = new EmployerSettlementsService(
      prisma,
      {} as any,
      email as any,
      {} as any,
    );

    await expect(
      service.sendReport('settlement-1', {
        role: 'EMPLOYER',
        userId: 'employer-user',
      }),
    ).rejects.toThrow('You can only send reports for your own settlements');
    expect(email.sendSettlementReportEmail).not.toHaveBeenCalled();
  });
});
