import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEmployeeDto } from './employees/dto/create-employee.dto';
import { CreateEmployerDto } from './employers/dto/create-employer.dto';
import { EmployersService } from './employers/employers.service';
import { SalaryRequestsService } from './salary-requests/salary-requests.service';
import { EmployerSettlementsService } from './employer-settlements/employer-settlements.service';
import { HealthController } from './health/health.controller';
import { MembershipService } from './membership/membership.service';
import { EmployeesService } from './employees/employees.service';

describe('Backend stabilization fixes', () => {
  it('rejects invalid payroll dates and non-positive salaries', async () => {
    const employer = plainToInstance(CreateEmployerDto, {
      companyName: 'Northstar',
      companyCode: 'NORTHSTAR',
      contactPerson: 'Rohan',
      email: 'hr@northstar.com',
      phone: '9999999999',
      payrollDate: 35,
      payrollCutoffDate: 0,
    });
    const employee = plainToInstance(CreateEmployeeDto, {
      employeeCode: 'EMP001',
      name: 'Arjun',
      email: 'arjun@northstar.com',
      phone: '9999999998',
      salaryInHand: -5000,
    });

    const employerErrors = await validate(employer);
    const employeeErrors = await validate(employee);

    expect(employerErrors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['payrollDate', 'payrollCutoffDate']),
    );
    expect(employeeErrors.map((error) => error.property)).toContain(
      'salaryInHand',
    );
  });

  it('rejects non-positive salaries in bulk employee creation', async () => {
    const prisma = {
      employer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'employer-1',
          companyName: 'Northstar',
        }),
      },
      employee: { findFirst: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    const service = new EmployeesService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.bulkCreate('employer-user-1', [
        {
          employeeCode: 'EMP001',
          name: 'Arjun',
          email: 'arjun@northstar.com',
          phone: '9999999998',
          salaryInHand: -5000,
        },
      ]),
    ).resolves.toEqual({
      successCount: 0,
      failureCount: 1,
      created: [],
      errors: [
        expect.objectContaining({
          employeeCode: 'EMP001',
          message: 'Salary in hand must be greater than zero',
        }),
      ],
    });
    expect(prisma.employee.findFirst).not.toHaveBeenCalled();
  });

  it('subtracts active salary requests from employee available advance', async () => {
    const prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'employee-1',
          name: 'Arjun',
          email: 'arjun@northstar.com',
          phone: '9999999998',
          employeeCode: 'EMP001',
          profilePhotoUrl: null,
          selfieUrl: 'selfie.jpg',
          selfieStatus: 'VERIFIED',
          selfieVerifiedAt: new Date(),
          salaryInHand: 54000,
          employer: {
            id: 'employer-1',
            companyName: 'Northstar',
            payrollDate: 28,
          },
          membership: { status: 'ACTIVE' },
          bankAccount: { id: 'bank-1' },
          kycDocuments: [{ id: 'kyc-1' }],
          appActivated: true,
          employmentStatus: 'ACTIVE',
        }),
      },
      setting: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ value: '10' })
          .mockResolvedValueOnce({ value: '10000' }),
      },
      salaryRequest: {
        findMany: jest.fn().mockResolvedValue([
          { amount: 5000, approvedAmount: null },
        ]),
      },
    };
    const service = new EmployeesService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.findByUserId('employee-user-1')).resolves.toEqual(
      expect.objectContaining({
        approvedLimit: 5400,
        activeRequestAmount: 5000,
        availableAdvance: 400,
      }),
    );
    expect(prisma.salaryRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId: 'employee-1',
          status: {
            in: [
              'SUBMITTED',
              'EMPLOYER_APPROVED',
              'AWAITING_MEMBERSHIP_PAYMENT',
              'READY_FOR_DISBURSAL',
              'DISBURSED',
              'REPAYMENT_SCHEDULED',
            ],
          },
        }),
      }),
    );
  });

  it('restores the full advance after requests are completed', async () => {
    const prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'employee-1',
          name: 'Arjun',
          email: 'arjun@northstar.com',
          phone: '9999999998',
          employeeCode: 'EMP001',
          profilePhotoUrl: null,
          selfieUrl: null,
          selfieStatus: 'PENDING',
          selfieVerifiedAt: null,
          salaryInHand: 54000,
          employer: {
            id: 'employer-1',
            companyName: 'Northstar',
            payrollDate: 28,
          },
          membership: null,
          bankAccount: null,
          kycDocuments: [],
          appActivated: true,
          employmentStatus: 'ACTIVE',
        }),
      },
      setting: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ value: '10' })
          .mockResolvedValueOnce({ value: '10000' }),
      },
      salaryRequest: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new EmployeesService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.findByUserId('employee-user-1')).resolves.toEqual(
      expect.objectContaining({
        approvedLimit: 5400,
        activeRequestAmount: 0,
        availableAdvance: 5400,
      }),
    );
  });

  it('returns fallback employer credentials when activation email fails', async () => {
    const prisma = {
      employer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'employer-1',
          status: 'PENDING',
          email: 'hr@northstar.com',
          companyName: 'Northstar',
          user: { id: 'user-1' },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'employer-1',
          status: 'ACTIVE',
          email: 'hr@northstar.com',
          companyName: 'Northstar',
        }),
      },
    };
    const email = {
      sendEmployerApprovedEmail: jest
        .fn()
        .mockRejectedValue(new Error('SMTP unavailable')),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new EmployersService(
      prisma as any,
      email as any,
      audit as any,
    );
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const result = await service.updateStatus(
      'employer-1',
      'ACTIVE' as any,
      'admin-1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'ACTIVE',
        emailDelivered: false,
        temporaryPassword: expect.stringMatching(/^MobPae-.+!1$/),
      }),
    );
    consoleError.mockRestore();
  });

  it('queries pending requests using the authenticated employer user', async () => {
    const prisma = {
      salaryRequest: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new SalaryRequestsService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.findPendingByEmployer('employer-user-1');

    expect(prisma.salaryRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          employee: { employer: { userId: 'employer-user-1' } },
          status: 'SUBMITTED',
        },
      }),
    );
  });

  it('treats an overdue settlement as employer risk', async () => {
    const prisma = {
      employer: {
        findUnique: jest.fn().mockResolvedValue({ id: 'employer-1' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      employerSettlement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'settlement-1',
            status: 'OVERDUE',
            dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          },
        ]),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const settings = {
      getEmployerSettlementPolicy: jest
        .fn()
        .mockResolvedValue({ gracePeriodDays: 3 }),
    };
    const service = new EmployerSettlementsService(
      prisma as any,
      settings as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.updateEmployerRiskStatus('employer-1'),
    ).resolves.toEqual({ employerId: 'employer-1', riskStatus: 'BLOCKED' });
    expect(prisma.employerSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
        }),
      }),
    );
  });

  it('checks the database in the production health response', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const controller = new HealthController(prisma as any);

    await expect(controller.check()).resolves.toEqual(
      expect.objectContaining({ status: 'ok', database: 'connected' }),
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('audits membership rejection', async () => {
    const prisma = {
      membership: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'membership-1',
          status: 'PENDING',
          remarks: null,
          employee: {
            userId: 'employee-user-1',
            email: 'employee@northstar.com',
            name: 'Arjun',
          },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'membership-1',
          status: 'PENDING',
          remarks: 'Payment failed',
        }),
      },
    };
    const email = {
      sendMembershipRejectedEmail: jest.fn().mockResolvedValue(undefined),
    };
    const notifications = {
      createSystemNotification: jest.fn().mockResolvedValue(undefined),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new MembershipService(
      prisma as any,
      email as any,
      notifications as any,
      audit as any,
    );

    await service.reject('membership-1', 'Payment failed', 'admin-1');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        action: 'MEMBERSHIP_REJECTED',
        entityType: 'MEMBERSHIP',
        entityId: 'membership-1',
      }),
    );
  });
});
