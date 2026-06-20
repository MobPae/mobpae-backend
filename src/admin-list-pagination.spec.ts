import { AuditLogsService } from './audit-logs/audit-logs.service';
import { EmployeesService } from './employees/employees.service';
import { EmployerEnquiriesService } from './employer-enquiries/employer-enquiries.service';
import { EmployerSettlementsService } from './employer-settlements/employer-settlements.service';
import { EmployersService } from './employers/employers.service';
import { MembershipService } from './membership/membership.service';
import { NotificationsService } from './notifications/notifications.service';
import { SalaryRequestsService } from './salary-requests/salary-requests.service';

function createPrisma(modelName: string, data: unknown[] = [{ id: 'row-1' }]) {
  const model = {
    findMany: jest.fn().mockResolvedValue(data),
    count: jest.fn().mockResolvedValue(data.length),
  };

  return {
    [modelName]: model,
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  } as any;
}

function expectPaginated(result: unknown) {
  expect(result).toEqual({
    data: [{ id: 'row-1' }],
    pagination: {
      page: 2,
      limit: 5,
      total: 1,
      totalPages: 1,
    },
  });
}

describe('admin list pagination coverage', () => {
  it('paginates, searches, sorts, and filters employers', async () => {
    const prisma = createPrisma('employer');
    const service = new EmployersService(prisma, {} as any, {} as any);

    const result = await service.findAll({
      page: 2,
      limit: 5,
      search: 'north',
      status: 'ACTIVE',
      riskStatus: 'GOOD',
      sortBy: 'companyName',
      sortOrder: 'asc',
    });

    expectPaginated(result);
    expect(prisma.employer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          riskStatus: 'GOOD',
          OR: expect.any(Array),
        }),
        orderBy: { companyName: 'asc' },
        skip: 5,
        take: 5,
      }),
    );
  });

  it('paginates, searches, sorts, and filters employees', async () => {
    const prisma = createPrisma('employee');
    const service = new EmployeesService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.findAll({
      page: 2,
      limit: 5,
      search: 'arjun',
      employerId: 'employer-1',
      employmentStatus: 'ACTIVE',
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expectPaginated(result);
    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employerId: 'employer-1',
          employmentStatus: 'ACTIVE',
          OR: expect.any(Array),
        }),
        orderBy: { name: 'asc' },
        skip: 5,
        take: 5,
      }),
    );
  });

  it('paginates, searches, sorts, and filters employer enquiries', async () => {
    const prisma = createPrisma('employerEnquiry');
    const service = new EmployerEnquiriesService(prisma, {} as any, {} as any);

    const result = await service.findAll({
      page: 2,
      limit: 5,
      search: 'lead',
      status: 'NEW',
      sortBy: 'companyName',
      sortOrder: 'asc',
    });

    expectPaginated(result);
    expect(prisma.employerEnquiry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'NEW',
          OR: expect.any(Array),
        }),
        orderBy: { companyName: 'asc' },
        skip: 5,
        take: 5,
      }),
    );
  });

  it('paginates, searches, sorts, and filters salary requests', async () => {
    const prisma = createPrisma('salaryRequest');
    const service = new SalaryRequestsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.findAllForAdmin({
      page: 2,
      limit: 5,
      search: 'employee',
      status: 'SUBMITTED',
      employerId: 'employer-1',
      employeeId: 'employee-1',
      sortBy: 'requestedAt',
      sortOrder: 'asc',
    });

    expectPaginated(result);
    expect(prisma.salaryRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'SUBMITTED',
          employerId: 'employer-1',
          employeeId: 'employee-1',
          OR: expect.any(Array),
        }),
        orderBy: { requestedAt: 'asc' },
        skip: 5,
        take: 5,
      }),
    );
  });

  it('paginates, searches, sorts, and filters audit logs', async () => {
    const prisma = createPrisma('auditLog');
    const service = new AuditLogsService(prisma);

    const result = await service.findAll({
      page: 2,
      limit: 5,
      search: 'created',
      action: 'EMPLOYER_CREATED',
      entityType: 'EMPLOYER',
      userId: 'admin-1',
      sortBy: 'action',
      sortOrder: 'asc',
    });

    expectPaginated(result);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: 'EMPLOYER_CREATED',
          entityType: 'EMPLOYER',
          userId: 'admin-1',
          OR: expect.any(Array),
        }),
        orderBy: { action: 'asc' },
        skip: 5,
        take: 5,
      }),
    );
  });

  it('paginates, searches, sorts, and filters notifications', async () => {
    const prisma = createPrisma('notification');
    const service = new NotificationsService(prisma);

    const result = await service.findAll({
      page: 2,
      limit: 5,
      search: 'overdue',
      userId: 'user-1',
      isRead: 'false',
      sortBy: 'createdAt',
      sortOrder: 'asc',
    });

    expectPaginated(result);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          isRead: false,
          OR: expect.any(Array),
        }),
        orderBy: { createdAt: 'asc' },
        skip: 5,
        take: 5,
      }),
    );
  });

  it('paginates, searches, sorts, and filters employer settlements', async () => {
    const prisma = createPrisma('employerSettlement');
    const service = new EmployerSettlementsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.findAll({
      page: 2,
      limit: 5,
      search: '2026-06',
      status: 'PENDING',
      employerId: 'employer-1',
      sortBy: 'dueDate',
      sortOrder: 'asc',
    });

    expectPaginated(result);
    expect(prisma.employerSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PENDING',
          employerId: 'employer-1',
          OR: expect.any(Array),
        }),
        orderBy: { dueDate: 'asc' },
        skip: 5,
        take: 5,
      }),
    );
  });

  it('paginates, searches, sorts, and filters memberships', async () => {
    const prisma = createPrisma('membership');
    const service = new MembershipService(prisma, {} as any, {} as any, {} as any);

    const result = await service.findAll({
      page: 2,
      limit: 5,
      search: 'annual',
      status: 'ACTIVE',
      sortBy: 'endDate',
      sortOrder: 'asc',
    });

    expectPaginated(result);
    expect(prisma.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          OR: expect.any(Array),
        }),
        orderBy: { endDate: 'asc' },
        skip: 5,
        take: 5,
      }),
    );
  });
});
