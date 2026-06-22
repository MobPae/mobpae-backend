import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth/auth.service';
import { BankAccountsService } from './bank-accounts/bank-accounts.service';
import { DisbursalsService } from './disbursals/disbursals.service';
import { EmployeesService } from './employees/employees.service';
import { EmployerEnquiriesService } from './employer-enquiries/employer-enquiries.service';
import { EmployerSettlementsService } from './employer-settlements/employer-settlements.service';
import { EmployersService } from './employers/employers.service';
import { KycDocumentsService } from './kyc-documents/kyc-documents.service';
import { PayrollService } from './payroll/payroll.service';
import { SalaryRequestsService } from './salary-requests/salary-requests.service';

const now = new Date('2026-06-18T10:00:00.000Z');

function mockAudit() {
  return {
    log: jest.fn().mockResolvedValue(undefined),
    logAuth: jest.fn().mockResolvedValue(undefined),
  };
}

function mockNotifications() {
  return {
    createSystemNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }),
  };
}

function mockEmail() {
  return {
    sendEmployerEnquiryEmail: jest.fn().mockResolvedValue({}),
    sendEmployerApprovedEmail: jest.fn().mockResolvedValue({}),
    sendKycApprovedEmail: jest.fn().mockResolvedValue({}),
    sendSalaryRequestSubmittedEmail: jest.fn().mockResolvedValue({}),
    sendSalaryRequestApprovedEmail: jest.fn().mockResolvedValue({}),
    sendDisbursalSuccessfulEmail: jest.fn().mockResolvedValue({}),
    sendSettlementReportEmail: jest.fn().mockResolvedValue({}),
    sendPasswordChangedEmail: jest.fn().mockResolvedValue({}),
  };
}

function mockSettings() {
  return {
    getAdvanceSettings: jest.fn().mockResolvedValue({
      advancePercentage: 10,
      interestChargePercentage: 36,
      processingFeePercentage: 0,
      minimumSalary: 10000,
      maximumAdvance: 10000,
      requireKyc: true,
      requireBankVerification: true,
      allowMultipleRequestsPerCycle: false,
      allowRequestWithOutstandingBalance: false,
    }),
    calculateAvailableAdvance: jest.fn().mockReturnValue(5000),
  };
}

function mockSettingsPolicy() {
  return {
    getAnnualInterestRate: jest.fn().mockResolvedValue(36),
    getEmployerSettlementPolicy: jest.fn().mockResolvedValue({
      gracePeriodDays: 3,
      lateFeePercentage: 30,
    }),
  };
}

describe('critical MVP workflow unit coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates website enquiry, writes audit, and ignores email failure', async () => {
    const prisma = {
      employerEnquiry: {
        create: jest.fn().mockResolvedValue({
          id: 'enquiry-1',
          companyName: 'Northstar Retail',
          contactPerson: 'Rohan',
          email: 'lead@example.com',
          phone: '9999999999',
          employeeCount: 25,
          status: 'NEW',
        }),
      },
    };
    const email = mockEmail();
    email.sendEmployerEnquiryEmail.mockRejectedValueOnce(
      new Error('SMTP down'),
    );
    const audit = mockAudit();
    const service = new EmployerEnquiriesService(
      prisma as any,
      email as any,
      audit as any,
    );

    await expect(
      service.create({
        companyName: 'Northstar Retail',
        contactPerson: 'Rohan',
        email: 'lead@example.com',
        phone: '9999999999',
        employeeCount: 25,
      }),
    ).resolves.toMatchObject({ id: 'enquiry-1' });

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYER_ENQUIRY_CREATED',
        entityType: 'EMPLOYER_ENQUIRY',
        entityId: 'enquiry-1',
      }),
    );
    expect(console.error).toHaveBeenCalledWith(
      'Failed to send employer enquiry email',
      expect.any(Error),
    );
  });

  it('onboards employer from enquiry and audits enquiry onboarding', async () => {
    const tx = {
      employerEnquiry: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'enquiry-1',
          email: 'hr@northstar.com',
          status: 'NEW',
          employerId: null,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'enquiry-1',
          status: 'ONBOARDED',
          employerId: 'employer-1',
        }),
      },
      employer: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'employer-1',
          companyName: 'Northstar',
          companyCode: 'NORTH',
          email: 'hr@northstar.com',
          status: 'PENDING',
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'user-employer',
          email: 'hr@northstar.com',
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new EmployersService(
      prisma as any,
      mockEmail() as any,
      mockAudit() as any,
    );

    await expect(
      service.create(
        {
          companyName: 'Northstar',
          companyCode: 'NORTH',
          contactPerson: 'Rohan',
          email: 'hr@northstar.com',
          phone: '9999999999',
          employerEnquiryId: 'enquiry-1',
        },
        'admin-1',
      ),
    ).resolves.toMatchObject({ employerId: 'employer-1', status: 'PENDING' });

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'EMPLOYER_ENQUIRY_ONBOARDED',
          entityId: 'enquiry-1',
        }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'EMPLOYER_CREATED',
          entityId: 'employer-1',
        }),
      }),
    );
  });

  it('activates employer, sends approval email, and writes audit', async () => {
    const prisma = {
      employer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'employer-1',
          status: 'PENDING',
          email: 'hr@northstar.com',
          companyName: 'Northstar',
          user: { id: 'user-employer' },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'employer-1',
          status: 'ACTIVE',
          email: 'hr@northstar.com',
          companyName: 'Northstar',
        }),
      },
    };
    const email = mockEmail();
    const audit = mockAudit();
    const service = new EmployersService(
      prisma as any,
      email as any,
      audit as any,
    );

    await service.updateStatus('employer-1', 'ACTIVE' as any, 'admin-1');

    expect(email.sendEmployerApprovedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'hr@northstar.com',
        loginEmail: 'hr@northstar.com',
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYER_ACTIVATED',
        entityType: 'EMPLOYER',
        entityId: 'employer-1',
      }),
    );
  });

  it('bulk employee creation wraps each user+employee row in a transaction and audits', async () => {
    const tx = {
      user: {
        create: jest.fn().mockResolvedValue({ id: 'user-employee' }),
      },
      employee: {
        create: jest.fn().mockResolvedValue({
          id: 'employee-1',
          employerId: 'employer-1',
          employeeCode: 'EMP001',
          name: 'Arjun',
          email: 'arjun@example.com',
          employmentStatus: 'ACTIVE',
          appActivated: false,
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      employer: {
        findUnique: jest.fn().mockResolvedValue({ id: 'employer-1' }),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new EmployeesService(
      prisma as any,
      mockAudit() as any,
      {} as any,
      mockNotifications() as any,
      {} as any,
    );

    const result = await service.bulkCreate('employer-user', [
      {
        employeeCode: 'EMP001',
        name: 'Arjun',
        email: 'arjun@example.com',
        phone: '9999999999',
        salaryInHand: 54000,
      },
    ]);

    expect(result.successCount).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'EMPLOYEE_CREATED',
          entityId: 'employee-1',
        }),
      }),
    );
  });

  it('allows activated employee login and writes auth audit', async () => {
    const hashedPassword = await bcrypt.hash('Password@123', 10);

    const prisma = {
      userSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'session-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-employee',
          email: 'arjun@example.com',
          role: 'EMPLOYEE',
          isActive: true,
          passwordChanged: false,
        }),
      },
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'employee-1',
          employmentStatus: 'ACTIVE',
          appActivated: true,
        }),
      },
    };
    const usersService = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 'user-employee',
        email: 'arjun@example.com',
        password: hashedPassword,
      }),
    };
    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('access-token'),
    };
    const audit = mockAudit();
    const service = new AuthService(
      usersService as any,
      jwtService as any,
      mockEmail() as any,
      audit as any,
      prisma as any,
    );

    const result = await service.login('arjun@example.com', 'Password@123');

    expect(result.user).toMatchObject({
      role: 'EMPLOYEE',
      employeeId: 'employee-1',
      passwordChanged: false,
    });
    expect(result.refreshToken).toContain('session-1.');
    expect(audit.logAuth).toHaveBeenCalledWith(
      'LOGIN_SUCCESS',
      expect.objectContaining({ userId: 'user-employee' }),
    );
  });

  it('submits and approves KYC with notification, email, and audit', async () => {
    const prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'employee-1',
          userId: 'user-employee',
        }),
      },
      kycDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'kyc-1',
          employeeId: 'employee-1',
          documentType: 'PAN',
          filePath: 'uploads/pan.pdf',
          status: 'PENDING',
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'kyc-1',
          status: 'PENDING',
        }),
        update: jest.fn().mockResolvedValue({
          id: 'kyc-1',
          documentType: 'PAN',
          status: 'VERIFIED',
          verifiedAt: now,
          employee: {
            id: 'employee-1',
            userId: 'user-employee',
            email: 'arjun@example.com',
            name: 'Arjun',
          },
        }),
      },
    };
    const email = mockEmail();
    const audit = mockAudit();
    const notifications = mockNotifications();
    const service = new KycDocumentsService(
      prisma as any,
      email as any,
      audit as any,
      notifications as any,
    );

    await service.create('user-employee', {
      documentType: 'PAN' as any,
      filePath: 'uploads/pan.pdf',
    });
    await service.verify('kyc-1', 'admin-1');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'KYC_SUBMITTED' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'KYC_APPROVED' }),
    );
    expect(email.sendKycApprovedEmail).toHaveBeenCalled();
    expect(notifications.createSystemNotification).toHaveBeenCalledWith(
      'user-employee',
      'KYC Approved',
      expect.any(String),
    );
  });

  it('verifies bank account and notifies employee with audit', async () => {
    const prisma = {
      employeeBankAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'bank-1',
          employeeId: 'employee-1',
          accountNumber: '1234567890',
          verified: false,
          employee: { userId: 'user-employee' },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'bank-1',
          employeeId: 'employee-1',
          accountNumber: '1234567890',
          verified: true,
        }),
      },
    };
    const audit = mockAudit();
    const notifications = mockNotifications();
    const service = new BankAccountsService(
      prisma as any,
      audit as any,
      notifications as any,
      {} as any,
    );

    const result = await service.verify('bank-1', 'admin-1');

    expect(result.accountNumber).toBe('********7890');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BANK_APPROVED',
        entityId: 'bank-1',
      }),
    );
    expect(notifications.createSystemNotification).toHaveBeenCalledWith(
      'user-employee',
      'Bank Account Approved',
      expect.any(String),
    );
  });

  it('creates, approves, and rejects salary requests with audit and notifications', async () => {
    const baseRequest = {
      id: 'request-1',
      employeeId: 'employee-1',
      employerId: 'employer-1',
      amount: 5000,
      approvedAmount: null,
      status: 'SUBMITTED',
      remarks: null,
      requestedAt: now,
      employee: {
        id: 'employee-1',
        userId: 'user-employee',
        email: 'arjun@example.com',
        name: 'Arjun',
      },
    };
    const prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'employee-1',
          employerId: 'employer-1',
          salaryInHand: 54000,
          selfieStatus: 'VERIFIED',
        }),
      },
      kycDocument: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { documentType: 'PAN' },
            { documentType: 'AADHAR' },
            { documentType: 'SALARY_SLIP' },
          ]),
      },
      employeeBankAccount: {
        findUnique: jest.fn().mockResolvedValue({ verified: true }),
      },
      salaryRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(baseRequest),
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            ...baseRequest,
          })
          .mockResolvedValueOnce({
            ...baseRequest,
            status: 'EMPLOYER_APPROVED',
          })
          .mockResolvedValueOnce({
            ...baseRequest,
            id: 'request-2',
          })
          .mockResolvedValueOnce({
            ...baseRequest,
            id: 'request-2',
            status: 'EMPLOYER_REJECTED',
            remarks: 'Need more info',
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      repayment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      employer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'employer-1',
        }),
      },
    };
    const audit = mockAudit();
    const notifications = mockNotifications();
    const email = mockEmail();
    const service = new SalaryRequestsService(
      prisma as any,
      notifications as any,
      mockSettings() as any,
      { isActive: jest.fn().mockResolvedValue(true) } as any,
      email as any,
      audit as any,
    );

    await service.create('user-employee', { amount: 5000 });
    await service.approve('request-1', 'employer-user');
    await service.reject('request-2', 'Need more info', 'employer-user');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SALARY_REQUEST_CREATED' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SALARY_REQUEST_APPROVED' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SALARY_REQUEST_REJECTED' }),
    );
    expect(notifications.createSystemNotification).toHaveBeenCalledWith(
      'user-employee',
      'Salary Request Approved',
      expect.any(String),
    );
    expect(email.sendSalaryRequestSubmittedEmail).toHaveBeenCalled();
    expect(email.sendSalaryRequestApprovedEmail).toHaveBeenCalled();
  });

  it('protects salary request details by employer ownership', async () => {
    const prisma = {
      salaryRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'request-1',
          employerId: 'employer-2',
          amount: 5000,
          approvedAmount: null,
          status: 'SUBMITTED',
          requestedAt: now,
          remarks: null,
          employee: {
            id: 'employee-1',
            employeeCode: 'EMP001',
            name: 'Arjun',
            email: 'arjun@example.com',
            phone: '9999999999',
            salaryInHand: 54000,
          },
          repayment: null,
          disbursal: null,
        }),
      },
      employer: {
        findUnique: jest.fn().mockResolvedValue({ id: 'employer-1' }),
      },
    };
    const service = new SalaryRequestsService(
      prisma as any,
      mockNotifications() as any,
      mockSettings() as any,
      { isActive: jest.fn() } as any,
      mockEmail() as any,
      mockAudit() as any,
    );

    await expect(
      service.findOne('request-1', {
        role: 'EMPLOYER',
        userId: 'employer-user',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('disburses atomically and audits repayment plus disbursal completion', async () => {
    const existingDisbursal = {
      id: 'disbursal-1',
      salaryRequestId: 'request-1',
      amount: 5000,
      status: 'PENDING',
      disbursedAt: null,
    };
    const salaryRequest = {
      id: 'request-1',
      amount: 5000,
      approvedAmount: 5000,
      requestedAt: now,
      employer: {
        id: 'employer-1',
        riskStatus: 'GOOD',
        payrollCutoffDate: 22,
        payrollDate: 28,
      },
      employee: {
        userId: 'user-employee',
        email: 'arjun@example.com',
        name: 'Arjun',
      },
    };
    const tx = {
      repayment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'repayment-1',
          salaryRequestId: 'request-1',
          principalAmount: 5000,
          interestAmount: 50,
          totalAmount: 5050,
          interestRate: 36,
          interestDays: 10,
          dueDate: now,
          status: 'SCHEDULED',
        }),
      },
      disbursal: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          ...existingDisbursal,
          status: 'DISBURSED',
          disbursedAt: now,
        }),
      },
      salaryRequest: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      disbursal: {
        findUnique: jest.fn().mockResolvedValue(existingDisbursal),
      },
      salaryRequest: {
        findUnique: jest.fn().mockResolvedValue(salaryRequest),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const audit = mockAudit();
    const service = new DisbursalsService(
      prisma as any,
      mockNotifications() as any,
      mockEmail() as any,
      audit as any,
      mockSettingsPolicy() as any,
    );

    await service.disburse('disbursal-1', 'admin-1');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.repayment.create).toHaveBeenCalled();
    expect(tx.disbursal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
        data: expect.objectContaining({ status: 'DISBURSED' }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REPAYMENT_CREATED' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DISBURSAL_DISBURSED' }),
    );
  });

  it('processes payroll recovery, generates settlement, and audits both actions', async () => {
    const repayments = [
      {
        id: 'repayment-1',
        salaryRequestId: 'request-1',
        principalAmount: 5000,
        interestAmount: 50,
      },
    ];
    const tx = {
      repayment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      salaryRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      employerSettlement: {
        create: jest.fn().mockResolvedValue({
          id: 'settlement-1',
          status: 'PENDING',
        }),
      },
    };
    const prisma = {
      employer: {
        findUnique: jest.fn().mockResolvedValue({ id: 'employer-1' }),
      },
      employerSettlement: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      repayment: {
        findMany: jest.fn().mockResolvedValue(repayments),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const audit = mockAudit();
    const service = new PayrollService(
      prisma as any,
      mockSettingsPolicy() as any,
      audit as any,
    );

    await service.processRecovery('employer-1', 'admin-1');

    expect(tx.repayment.updateMany).toHaveBeenCalled();
    expect(tx.salaryRequest.updateMany).toHaveBeenCalled();
    expect(tx.employerSettlement.create).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PAYROLL_RECOVERY_PROCESSED' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SETTLEMENT_GENERATED' }),
    );
  });

  it('marks settlement paid with audit and sends settlement report email', async () => {
    const settlement = {
      id: 'settlement-1',
      employerId: 'employer-1',
      payrollMonth: '2026-06',
      outstandingAmount: 5050,
      status: 'PENDING',
      paidDate: null,
      referenceNumber: null,
      employer: {
        companyName: 'Northstar',
        email: 'hr@northstar.com',
      },
    };
    const prisma = {
      employerSettlement: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(settlement)
          .mockResolvedValue({
            ...settlement,
            status: 'PAID',
            paidDate: now,
            outstandingAmount: 0,
            referenceNumber: 'UTR123',
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      employer: {
        findUnique: jest.fn().mockResolvedValue({ id: 'employer-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const email = mockEmail();
    const audit = mockAudit();
    const service = new EmployerSettlementsService(
      prisma as any,
      mockSettingsPolicy() as any,
      email as any,
      audit as any,
    );

    await service.markPaid('settlement-1', 'UTR123', 'admin-1');
    await service.sendReport('settlement-1');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SETTLEMENT_PAID',
        entityId: 'settlement-1',
      }),
    );
    expect(email.sendSettlementReportEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'hr@northstar.com',
        settlementId: 'settlement-1',
      }),
    );
  });
});
