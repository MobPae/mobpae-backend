import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AuthController } from '../src/auth/auth.controller';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { AuthService } from '../src/auth/auth.service';
import { BankAccountsController } from '../src/bank-accounts/bank-accounts.controller';
import { BankAccountsService } from '../src/bank-accounts/bank-accounts.service';
import { DisbursalsController } from '../src/disbursals/disbursals.controller';
import { DisbursalsService } from '../src/disbursals/disbursals.service';
import { EmployeesController } from '../src/employees/employees.controller';
import { EmployeesService } from '../src/employees/employees.service';
import { EmployerEnquiriesController } from '../src/employer-enquiries/employer-enquiries.controller';
import { EmployerEnquiriesService } from '../src/employer-enquiries/employer-enquiries.service';
import { EmployerSettlementsController } from '../src/employer-settlements/employer-settlements.controller';
import { EmployerSettlementsService } from '../src/employer-settlements/employer-settlements.service';
import { EmployersController } from '../src/employers/employers.controller';
import { EmployersService } from '../src/employers/employers.service';
import { KycDocumentsController } from '../src/kyc-documents/kyc-documents.controller';
import { KycDocumentsService } from '../src/kyc-documents/kyc-documents.service';
import { PayrollController } from '../src/payroll/payroll.controller';
import { PayrollService } from '../src/payroll/payroll.service';
import { SalaryRequestsController } from '../src/salary-requests/salary-requests.controller';
import { SalaryRequestsService } from '../src/salary-requests/salary-requests.service';

const adminUser = {
  userId: 'admin-user',
  role: 'ADMIN',
};

const employerUser = {
  userId: 'employer-user',
  role: 'EMPLOYER',
};

const employeeUser = {
  userId: 'employee-user',
  role: 'EMPLOYEE',
  employeeId: 'employee-1',
};

function userForRole(role?: string) {
  if (role === 'EMPLOYER') return employerUser;
  if (role === 'EMPLOYEE') return employeeUser;
  return adminUser;
}

describe('critical MVP workflow routes (e2e)', () => {
  let app: INestApplication;

  const employerEnquiriesService = {
    create: jest.fn().mockResolvedValue({
      id: 'enquiry-1',
      status: 'NEW',
      email: 'hr@northstar.com',
    }),
    findAll: jest.fn().mockResolvedValue([]),
  };

  const employersService = {
    create: jest.fn().mockResolvedValue({
      employerId: 'employer-1',
      userId: 'employer-user',
      status: 'PENDING',
    }),
    updateStatus: jest.fn().mockResolvedValue({
      id: 'employer-1',
      status: 'ACTIVE',
    }),
  };

  const authService = {
    login: jest.fn().mockImplementation((email: string) =>
      Promise.resolve({
        accessToken: `${email}-access-token`,
        refreshToken: `${email}-refresh-token`,
        user: {
          id: email.includes('employee') ? 'employee-user' : 'employer-user',
          email,
          role: email.includes('employee') ? 'EMPLOYEE' : 'EMPLOYER',
        },
      }),
    ),
  };

  const employeesService = {
    create: jest.fn().mockResolvedValue({
      id: 'employee-1',
      employerId: 'employer-1',
      email: 'employee@northstar.com',
    }),
    updateActivation: jest.fn().mockResolvedValue({
      id: 'employee-1',
      appActivated: true,
    }),
    getProfile: jest.fn().mockResolvedValue({
      id: 'employee-1',
      name: 'Arjun',
      email: 'employee@northstar.com',
      profilePhotoUrl: 'uploads/profile.png',
      kycStatus: 'VERIFIED',
    }),
    uploadProfilePhoto: jest.fn().mockResolvedValue({
      id: 'employee-1',
      profilePhotoUrl: 'uploads/profile.png',
    }),
  };

  const kycDocumentsService = {
    create: jest.fn().mockResolvedValue({
      id: 'kyc-1',
      status: 'PENDING',
      documentType: 'PAN',
    }),
    verify: jest.fn().mockResolvedValue({
      id: 'kyc-1',
      status: 'VERIFIED',
    }),
  };

  const bankAccountsService = {
    create: jest.fn().mockResolvedValue({
      id: 'bank-1',
      verified: false,
    }),
    verify: jest.fn().mockResolvedValue({
      id: 'bank-1',
      verified: true,
    }),
  };

  const salaryRequestsService = {
    create: jest.fn().mockResolvedValue({
      id: 'request-1',
      amount: 5000,
      status: 'SUBMITTED',
    }),
    approve: jest.fn().mockResolvedValue({
      id: 'request-1',
      status: 'EMPLOYER_APPROVED',
    }),
    reject: jest.fn().mockResolvedValue({
      id: 'request-2',
      status: 'EMPLOYER_REJECTED',
    }),
  };

  const disbursalsService = {
    create: jest.fn().mockResolvedValue({
      id: 'disbursal-1',
      salaryRequestId: 'request-1',
      status: 'PENDING',
    }),
    disburse: jest.fn().mockResolvedValue({
      id: 'disbursal-1',
      status: 'DISBURSED',
    }),
  };

  const payrollService = {
    processRecovery: jest.fn().mockResolvedValue({
      settlementId: 'settlement-1',
      processedRepayments: 1,
      totalRecovered: 5050,
    }),
  };

  const employerSettlementsService = {
    findOne: jest.fn().mockResolvedValue({
      id: 'settlement-1',
      status: 'PENDING',
      outstandingAmount: 5050,
    }),
    markPaid: jest.fn().mockResolvedValue({
      id: 'settlement-1',
      status: 'PAID',
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        AuthController,
        BankAccountsController,
        DisbursalsController,
        EmployeesController,
        EmployerEnquiriesController,
        EmployerSettlementsController,
        EmployersController,
        KycDocumentsController,
        PayrollController,
        SalaryRequestsController,
      ],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: BankAccountsService, useValue: bankAccountsService },
        { provide: DisbursalsService, useValue: disbursalsService },
        { provide: EmployeesService, useValue: employeesService },
        {
          provide: EmployerEnquiriesService,
          useValue: employerEnquiriesService,
        },
        {
          provide: EmployerSettlementsService,
          useValue: employerSettlementsService,
        },
        { provide: EmployersService, useValue: employersService },
        { provide: KycDocumentsService, useValue: kycDocumentsService },
        { provide: PayrollService, useValue: payrollService },
        { provide: SalaryRequestsService, useValue: salaryRequestsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = userForRole(req.headers['x-test-role']);
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs the critical happy path from enquiry to settlement', async () => {
    await request(app.getHttpServer())
      .post('/employer-enquiries')
      .send({
        companyName: 'Northstar Retail',
        contactPerson: 'Rohan',
        email: 'hr@northstar.com',
        phone: '9999999999',
        employeeCount: 25,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({ id: 'enquiry-1', status: 'NEW' });
      });

    await request(app.getHttpServer())
      .post('/employers')
      .set('x-test-role', 'ADMIN')
      .send({
        companyName: 'Northstar Retail',
        companyCode: 'NORTH',
        contactPerson: 'Rohan',
        email: 'hr@northstar.com',
        phone: '9999999999',
        employerEnquiryId: 'enquiry-1',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          employerId: 'employer-1',
          status: 'PENDING',
        });
      });

    await request(app.getHttpServer())
      .patch('/employers/employer-1/status')
      .set('x-test-role', 'ADMIN')
      .send({ status: 'ACTIVE' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ACTIVE');
      });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'hr@northstar.com', password: 'TempPass@123' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.accessToken).toBe('hr@northstar.com-access-token');
      });

    await request(app.getHttpServer())
      .post('/employees')
      .set('x-test-role', 'EMPLOYER')
      .send({
        employeeCode: 'EMP001',
        name: 'Arjun',
        email: 'employee@northstar.com',
        phone: '9888888888',
        salaryInHand: 54000,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe('employee-1');
      });

    await request(app.getHttpServer())
      .patch('/employees/employee-1/activation')
      .set('x-test-role', 'EMPLOYER')
      .send({ appActivated: true })
      .expect(200)
      .expect(({ body }) => {
        expect(body.appActivated).toBe(true);
      });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'employee@northstar.com', password: 'TempPass@123' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.user.role).toBe('EMPLOYEE');
      });

    await request(app.getHttpServer())
      .post('/employees/profile-photo')
      .set('x-test-role', 'EMPLOYEE')
      .attach('file', Buffer.from('profile'), {
        filename: 'profile.png',
        contentType: 'image/png',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.profilePhotoUrl).toBe('uploads/profile.png');
      });

    await request(app.getHttpServer())
      .get('/employees/me/profile')
      .set('x-test-role', 'EMPLOYEE')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          profilePhotoUrl: 'uploads/profile.png',
          kycStatus: 'VERIFIED',
        });
      });

    await request(app.getHttpServer())
      .post('/kyc-documents')
      .set('x-test-role', 'EMPLOYEE')
      .send({ documentType: 'PAN', filePath: 'uploads/pan.pdf' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('PENDING');
      });

    await request(app.getHttpServer())
      .post('/kyc-documents/kyc-1/verify')
      .set('x-test-role', 'ADMIN')
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('VERIFIED');
      });

    await request(app.getHttpServer())
      .post('/bank-accounts')
      .set('x-test-role', 'EMPLOYEE')
      .send({
        accountHolderName: 'Arjun',
        bankName: 'HDFC Bank',
        accountNumber: '1234567890',
        ifscCode: 'HDFC0001234',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.verified).toBe(false);
      });

    await request(app.getHttpServer())
      .post('/bank-accounts/bank-1/verify')
      .set('x-test-role', 'ADMIN')
      .expect(201)
      .expect(({ body }) => {
        expect(body.verified).toBe(true);
      });

    await request(app.getHttpServer())
      .post('/salary-requests')
      .set('x-test-role', 'EMPLOYEE')
      .send({ amount: 5000 })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('SUBMITTED');
      });

    await request(app.getHttpServer())
      .post('/salary-requests/request-1/approve')
      .set('x-test-role', 'EMPLOYER')
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('EMPLOYER_APPROVED');
      });

    await request(app.getHttpServer())
      .post('/salary-requests/request-2/reject')
      .set('x-test-role', 'EMPLOYER')
      .send({ remarks: 'Need corrected amount' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('EMPLOYER_REJECTED');
      });

    await request(app.getHttpServer())
      .post('/disbursals')
      .set('x-test-role', 'ADMIN')
      .send({ salaryRequestId: 'request-1' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('PENDING');
      });

    await request(app.getHttpServer())
      .post('/disbursals/disbursal-1/disburse')
      .set('x-test-role', 'ADMIN')
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('DISBURSED');
      });

    await request(app.getHttpServer())
      .post('/payroll/process-recovery/employer-1')
      .set('x-test-role', 'ADMIN')
      .expect(201)
      .expect(({ body }) => {
        expect(body.settlementId).toBe('settlement-1');
      });

    await request(app.getHttpServer())
      .post('/employer-settlements/settlement-1/mark-paid')
      .set('x-test-role', 'ADMIN')
      .send({ referenceNumber: 'UTR123' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('PAID');
      });

    expect(employerEnquiriesService.create).toHaveBeenCalled();
    expect(employersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ employerEnquiryId: 'enquiry-1' }),
      'admin-user',
    );
    expect(employersService.updateStatus).toHaveBeenCalledWith(
      'employer-1',
      'ACTIVE',
      'admin-user',
    );
    expect(employeesService.create).toHaveBeenCalledWith(
      expect.objectContaining({ employeeCode: 'EMP001' }),
      'employer-user',
    );
    expect(employeesService.uploadProfilePhoto).toHaveBeenCalledWith(
      'employee-user',
      expect.objectContaining({ mimetype: 'image/png' }),
    );
    expect(employeesService.getProfile).toHaveBeenCalledWith('employee-user');
    expect(kycDocumentsService.create).toHaveBeenCalledWith(
      'employee-user',
      expect.objectContaining({ documentType: 'PAN' }),
    );
    expect(bankAccountsService.verify).toHaveBeenCalledWith(
      'bank-1',
      'admin-user',
    );
    expect(salaryRequestsService.approve).toHaveBeenCalledWith(
      'request-1',
      'employer-user',
    );
    expect(disbursalsService.disburse).toHaveBeenCalledWith(
      'disbursal-1',
      'admin-user',
    );
    expect(payrollService.processRecovery).toHaveBeenCalledWith(
      'employer-1',
      'admin-user',
    );
    expect(employerSettlementsService.markPaid).toHaveBeenCalledWith(
      'settlement-1',
      'UTR123',
      'admin-user',
    );
  });
});
