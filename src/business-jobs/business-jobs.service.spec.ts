import { BusinessJobsService } from './business-jobs.service';

describe('BusinessJobsService', () => {
  const pastDate = new Date('2026-06-01T00:00:00.000Z');

  function createMocks() {
    const prisma = {
      membership: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      repayment: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      employerSettlement: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findMany: jest.fn(),
      },
      employer: {
        findMany: jest.fn(),
      },
    };
    const auditLogsService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    const notificationsService = {
      createSystemNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };
    const employerSettlementsService = {
      updateEmployerRiskStatus: jest.fn(),
    };

    return {
      prisma,
      auditLogsService,
      notificationsService,
      employerSettlementsService,
      service: new BusinessJobsService(
        prisma as any,
        auditLogsService as any,
        notificationsService as any,
        employerSettlementsService as any,
        {} as any, // salaryRequestsService
      ),
    };
  }

  it('expires memberships, audits, and notifies employees', async () => {
    const { prisma, auditLogsService, notificationsService, service } =
      createMocks();
    prisma.membership.findMany.mockResolvedValue([
      {
        id: 'membership-1',
        status: 'ACTIVE',
        endDate: pastDate,
        employee: {
          id: 'employee-1',
          userId: 'employee-user',
          name: 'Arjun',
        },
      },
    ]);

    await expect(service.expireMemberships()).resolves.toEqual({
      processed: 1,
    });

    expect(prisma.membership.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['membership-1'],
        },
      },
      data: {
        status: 'EXPIRED',
      },
    });
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MEMBERSHIP_EXPIRED',
        entityType: 'MEMBERSHIP',
        entityId: 'membership-1',
      }),
    );
    expect(notificationsService.createSystemNotification).toHaveBeenCalledWith(
      'employee-user',
      'Membership Expired',
      expect.any(String),
    );
  });

  it('marks repayments overdue, audits, and notifies employees', async () => {
    const { prisma, auditLogsService, notificationsService, service } =
      createMocks();
    prisma.repayment.findMany.mockResolvedValue([
      {
        id: 'repayment-1',
        status: 'SCHEDULED',
        dueDate: pastDate,
        salaryRequest: {
          employee: {
            id: 'employee-1',
            userId: 'employee-user',
            name: 'Arjun',
          },
        },
      },
    ]);

    await expect(service.markRepaymentsOverdue()).resolves.toEqual({
      processed: 1,
    });

    expect(prisma.repayment.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['repayment-1'],
        },
      },
      data: {
        status: 'OVERDUE',
      },
    });
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REPAYMENT_OVERDUE',
        entityType: 'REPAYMENT',
        entityId: 'repayment-1',
      }),
    );
    expect(notificationsService.createSystemNotification).toHaveBeenCalledWith(
      'employee-user',
      'Repayment Overdue',
      expect.any(String),
    );
  });

  it('marks settlements overdue, audits, and notifies admins plus employer', async () => {
    const { prisma, auditLogsService, notificationsService, service } =
      createMocks();
    prisma.employerSettlement.findMany.mockResolvedValue([
      {
        id: 'settlement-1',
        employerId: 'employer-1',
        status: 'PENDING',
        dueDate: pastDate,
        employer: {
          companyName: 'Northstar',
          user: {
            id: 'employer-user',
          },
        },
      },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 'admin-user' }]);

    await expect(service.markSettlementsOverdue()).resolves.toEqual({
      processed: 1,
    });

    expect(prisma.employerSettlement.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['settlement-1'],
        },
      },
      data: {
        status: 'OVERDUE',
      },
    });
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SETTLEMENT_OVERDUE',
        entityType: 'SETTLEMENT',
        entityId: 'settlement-1',
      }),
    );
    expect(notificationsService.createSystemNotification).toHaveBeenCalledWith(
      'admin-user',
      'Settlement Overdue',
      expect.any(String),
    );
    expect(notificationsService.createSystemNotification).toHaveBeenCalledWith(
      'employer-user',
      'Settlement Overdue',
      expect.any(String),
    );
  });

  it('recalculates risk for every employer', async () => {
    const { prisma, employerSettlementsService, service } = createMocks();
    prisma.employer.findMany.mockResolvedValue([
      { id: 'employer-1' },
      { id: 'employer-2' },
    ]);
    employerSettlementsService.updateEmployerRiskStatus
      .mockResolvedValueOnce({ employerId: 'employer-1', riskStatus: 'GOOD' })
      .mockResolvedValueOnce({
        employerId: 'employer-2',
        riskStatus: 'BLOCKED',
      });

    await expect(service.recalculateEmployerRisk()).resolves.toEqual({
      processed: 2,
      results: [
        { employerId: 'employer-1', riskStatus: 'GOOD' },
        { employerId: 'employer-2', riskStatus: 'BLOCKED' },
      ],
    });

    expect(
      employerSettlementsService.updateEmployerRiskStatus,
    ).toHaveBeenCalledWith('employer-1');
    expect(
      employerSettlementsService.updateEmployerRiskStatus,
    ).toHaveBeenCalledWith('employer-2');
  });
});
