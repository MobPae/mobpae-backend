import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEmployeeDto } from './employees/dto/create-employee.dto';
import { CreateEmployerDto } from './employers/dto/create-employer.dto';
import { EmployersService } from './employers/employers.service';
import { SalaryRequestsService } from './salary-requests/salary-requests.service';
import { EmployerSettlementsService } from './employer-settlements/employer-settlements.service';
import { HealthController } from './health/health.controller';
import { EmployeesService } from './employees/employees.service';
import { PreviewLoanApplicationDto } from './loan-applications/dto/preview-loan-application.dto';
import { PlatformFeesService } from './platform-fees/platform-fees.service';
import { AuthService } from './auth/auth.service';
import { LoanApplicationsService } from './loan-applications/loan-applications.service';

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
          salaryInHand: 54000,
          employer: {
            id: 'employer-1',
            companyName: 'Northstar',
            payrollDate: 28,
          },
          loanLimit: { maximumEligibleAmount: 5400 },
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
      loanApplication: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { requestedAmount: 5000, adminApprovedAmount: null },
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
        maximumEligibleAmount: 5400,
        activeRequestAmount: 5000,
        availableAdvance: 400,
      }),
    );
    expect(prisma.loanApplication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId: 'employee-1',
          status: {
            in: [
              'SUBMITTED',
              'EMPLOYER_APPROVED',
              'AWAITING_PLATFORM_FEE_PAYMENT',
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
          salaryInHand: 54000,
          employer: {
            id: 'employer-1',
            companyName: 'Northstar',
            payrollDate: 28,
          },
          loanLimit: { maximumEligibleAmount: 5400 },
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
      loanApplication: { findMany: jest.fn().mockResolvedValue([]) },
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
        maximumEligibleAmount: 5400,
        activeRequestAmount: 0,
        availableAdvance: 5400,
      }),
    );
  });

  it('does not expose employer credentials when activation email fails', async () => {
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
      }),
    );
    expect(result).not.toHaveProperty('temporaryPassword');
    consoleError.mockRestore();
  });

  it('keeps the legacy salary requests service disabled', async () => {
    const service = new SalaryRequestsService();

    expect(() => service.findPendingByEmployer('employer-user-1')).toThrow(
      'SalaryRequests has been replaced by LoanApplications',
    );
  });

  it('validates salary advance preview query amounts', async () => {
    const invalid = plainToInstance(PreviewLoanApplicationDto, {
      amount: '999',
    });
    const valid = plainToInstance(PreviewLoanApplicationDto, {
      amount: '3500',
    });

    await expect(validate(invalid)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'amount' })]),
    );
    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid.amount).toBe(3500);
  });

  it('hides payment provider references from employee-facing platform fee responses', () => {
    const service = new PlatformFeesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const employeeFee = (service as any).formatFee({
      id: 'fee-1',
      loanApplicationId: 'loan-1',
      employeeId: 'employee-1',
      employerId: 'employer-1',
      feeType: 'PLATFORM_FEE',
      amount: '175',
      currency: 'INR',
      status: 'PENDING_PAYMENT',
      provider: 'RAZORPAY',
      providerOrderId: 'order_sensitive',
      providerPaymentId: 'pay_sensitive',
      paidAt: null,
      waivedAt: null,
      waivedBy: null,
      remarks: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      paymentOrders: [{ providerOrderId: 'order_sensitive' }],
    });

    expect(employeeFee).not.toHaveProperty('providerOrderId');
    expect(employeeFee).not.toHaveProperty('providerPaymentId');
    expect(employeeFee).not.toHaveProperty('paymentOrders');
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
          status: { in: ['GENERATED', 'PARTIALLY_PAID', 'OVERDUE'] },
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

  it('returns previous login and current session details', async () => {
    const previousLogin = new Date('2026-07-13T08:00:00.000Z');
    const currentLogin = new Date('2026-07-14T08:00:00.000Z');
    const lastActive = new Date('2026-07-14T09:00:00.000Z');
    const prisma = {
      userSession: {
        findFirst: jest.fn().mockResolvedValue({ createdAt: previousLogin }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'session-current',
            deviceInfo:
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
            ipAddress: '103.21.244.10',
            createdAt: currentLogin,
            updatedAt: lastActive,
          },
        ]),
      },
    };
    const service = new AuthService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      prisma as any,
    );

    await expect(
      service.getCurrentUserProfile(
        {
          userId: 'user-1',
          email: 'employee@northstar.com',
          role: 'EMPLOYEE',
          sessionId: 'session-current',
        },
        'session-current',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        lastLoginAt: previousLogin,
      }),
    );

    await expect(
      service.listSessions('user-1', 'session-current'),
    ).resolves.toEqual({
      sessions: [
        expect.objectContaining({
          id: 'session-current',
          current: true,
          device: 'Chrome on macOS',
          ipAddress: '103.21.244.10',
          loginAt: currentLogin,
          lastActiveAt: lastActive,
        }),
      ],
    });
  });

  it('returns loan application lifecycle history with actor details', async () => {
    const submittedAt = new Date('2026-07-10T09:00:00.000Z');
    const approvedAt = new Date('2026-07-10T14:22:00.000Z');
    const prisma = {
      loanApplication: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'loan-1',
          employerId: 'employer-1',
          employee: {
            id: 'employee-1',
            userId: 'employee-user-1',
          },
        }),
      },
      loanApplicationHistory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'history-1',
            loanApplicationId: 'loan-1',
            previousStatus: null,
            newStatus: 'SUBMITTED',
            changedBy: 'employee-user-1',
            actorRole: 'EMPLOYEE',
            remarks: null,
            createdAt: submittedAt,
          },
          {
            id: 'history-2',
            loanApplicationId: 'loan-1',
            previousStatus: 'SUBMITTED',
            newStatus: 'AWAITING_PLATFORM_FEE_PAYMENT',
            changedBy: 'employer-user-1',
            actorRole: 'EMPLOYER',
            remarks: 'Employer approved; platform fee required',
            createdAt: approvedAt,
          },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'employee-user-1',
            email: 'ananya@northstar.com',
            role: 'EMPLOYEE',
            employee: { id: 'employee-1', name: 'Ananya Sharma' },
            employer: null,
          },
          {
            id: 'employer-user-1',
            email: 'rohan@northstar.com',
            role: 'EMPLOYER',
            employee: null,
            employer: {
              id: 'employer-1',
              companyName: 'Northstar Retail Pvt Ltd',
              contactPerson: 'Rohan Mehta',
            },
          },
        ]),
      },
    };
    const service = new LoanApplicationsService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.findHistory('loan-1', {
        userId: 'admin-1',
        role: 'ADMIN',
      }),
    ).resolves.toEqual({
      history: [
        {
          id: 'history-1',
          status: 'SUBMITTED',
          previousStatus: null,
          actorType: 'EMPLOYEE',
          actorName: 'Ananya Sharma',
          actorId: 'employee-user-1',
          note: null,
          createdAt: submittedAt,
        },
        {
          id: 'history-2',
          status: 'AWAITING_PLATFORM_FEE_PAYMENT',
          previousStatus: 'SUBMITTED',
          actorType: 'EMPLOYER',
          actorName: 'Rohan Mehta',
          actorId: 'employer-user-1',
          note: 'Employer approved; platform fee required',
          createdAt: approvedAt,
        },
      ],
    });
  });

  it('hides internal loan application history notes from employer viewers', async () => {
    const rejectedAt = new Date('2026-07-11T10:00:00.000Z');
    const prisma = {
      loanApplication: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'loan-1',
          employerId: 'employer-1',
          employee: {
            id: 'employee-1',
            userId: 'employee-user-1',
          },
        }),
      },
      employer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'employer-1',
        }),
      },
      loanApplicationHistory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'history-3',
            loanApplicationId: 'loan-1',
            previousStatus: 'EMPLOYER_APPROVED',
            newStatus: 'ADMIN_REJECTED',
            changedBy: 'admin-user-1',
            actorRole: 'ADMIN',
            remarks: 'Internal credit review mismatch - do not expose',
            createdAt: rejectedAt,
          },
          {
            id: 'history-4',
            loanApplicationId: 'loan-1',
            previousStatus: 'AWAITING_PLATFORM_FEE_PAYMENT',
            newStatus: 'EMPLOYER_APPROVED',
            changedBy: 'employee-user-1',
            actorRole: 'EMPLOYEE',
            remarks: 'Platform fee paid; ready for MobPae admin review.',
            createdAt: new Date('2026-07-10T16:00:00.000Z'),
          },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'admin-user-1',
            email: 'admin@mobpae.com',
            role: 'ADMIN',
            employee: null,
            employer: null,
          },
        ]),
      },
    };
    const service = new LoanApplicationsService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.findHistory('loan-1', {
        userId: 'employer-user-1',
        role: 'EMPLOYER',
      }),
    ).resolves.toEqual({
      history: [
        {
          id: 'history-3',
          status: 'ADMIN_REJECTED',
          previousStatus: 'EMPLOYER_APPROVED',
          actorType: 'ADMIN',
          actorName: 'MobPae Admin',
          actorId: null,
          note: 'MobPae rejected the request',
          createdAt: rejectedAt,
        },
      ],
    });
  });
});
