import {
  DisbursalStatus,
  EmployeeStatus,
  EmployerRiskStatus,
  EmployerSettlementStatus,
  EmployerStatus,
  KycDocumentType,
  KycStatus,
  MembershipStatus,
  NotificationType,
  Prisma,
  PrismaClient,
  RepaymentStatus,
  Role,
  SalaryRequestStatus,
  SelfieStatus,
} from '@prisma/client';

/**
 * Local enum mirrors AppInfoType in schema.prisma.
 * Replace with `import { AppInfoType } from '@prisma/client'` after `npx prisma generate`.
 */
const AppInfoType = {
  ABOUT: 'ABOUT',
  PRIVACY_POLICY: 'PRIVACY_POLICY',
  TERMS_CONDITIONS: 'TERMS_CONDITIONS',
  HOW_IT_WORKS: 'HOW_IT_WORKS',
  FAQ: 'FAQ',
  CONTACT: 'CONTACT',
  WHATS_NEW: 'WHATS_NEW',
} as const;
type AppInfoType = (typeof AppInfoType)[keyof typeof AppInfoType];
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@mobpae.com';
const EMPLOYER_EMAIL = 'employer@northstar.mobpae.com';
const ADMIN_PASSWORD = 'Admin@1234';
const DEMO_PASSWORD = 'Demo@1234';

const now = new Date();
const day = 24 * 60 * 60 * 1000;

function addDays(days: number) {
  return new Date(now.getTime() + days * day);
}

function isoMonth(offset = 0) {
  const date = new Date(now);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

async function upsertUser(email: string, role: Role, password: string) {
  return prisma.user.upsert({
    where: {
      email,
    },
    update: {
      role,
      isActive: true,
      password: await bcrypt.hash(password, 10),
      passwordChanged: true,
    },
    create: {
      email,
      role,
      isActive: true,
      password: await bcrypt.hash(password, 10),
      passwordChanged: true,
    },
  });
}

async function seedSettings() {
  const settings = [
    ['advancePercentage', '10'],
    ['interestChargePercentage', '36'],
    ['processingFeePercentage', '0'],
    ['minimumSalary', '10000'],
    ['maximumAdvance', '10000'],
    ['requireKyc', 'true'],
    ['requireBankVerification', 'true'],
    ['allowMultipleRequestsPerCycle', 'false'],
    ['allowRequestWithOutstandingBalance', 'false'],
    ['MEMBERSHIP_AMOUNT', '449'],
    ['MEMBERSHIP_VALIDITY_DAYS', '365'],
    ['MEMBERSHIP_PAYMENT_UPI_ID', 'jyotirmoy.upd@okicici'],
    ['MEMBERSHIP_PAYMENT_QR_URL', 'uploads/payment/googlepay-membership-qr.png'],
    ['MEMBERSHIP_PAYMENT_BENEFICIARY', 'Jyotirmoy Upadhaya'],
    [
      'MEMBERSHIP_PAYMENT_INSTRUCTIONS',
      'Pay the membership fee using UPI and upload the screenshot for verification.',
    ],
    ['EMPLOYER_GRACE_DAYS', '3'],
    ['EMPLOYER_LATE_FEE_PERCENTAGE', '30'],
  ];

  for (const [key, value] of settings) {
    await prisma.setting.upsert({
      where: {
        key,
      },
      update: {
        value,
      },
      create: {
        key,
        value,
      },
    });
  }
}

async function seedEmployer(adminUserId: string) {
  const employerUser = await upsertUser(
    EMPLOYER_EMAIL,
    Role.EMPLOYER,
    DEMO_PASSWORD,
  );

  const employer = await prisma.employer.upsert({
    where: {
      companyCode: 'NORTHSTAR',
    },
    update: {
      companyName: 'Northstar Retail Pvt Ltd',
      contactPerson: 'Rohan Mehta',
      email: EMPLOYER_EMAIL,
      phone: '+91 98765 43001',
      payrollDate: 28,
      payrollCutoffDate: 22,
      status: EmployerStatus.ACTIVE,
      riskStatus: EmployerRiskStatus.GOOD,
      userId: employerUser.id,
    },
    create: {
      companyName: 'Northstar Retail Pvt Ltd',
      companyCode: 'NORTHSTAR',
      contactPerson: 'Rohan Mehta',
      email: EMPLOYER_EMAIL,
      phone: '+91 98765 43001',
      payrollDate: 28,
      payrollCutoffDate: 22,
      status: EmployerStatus.ACTIVE,
      riskStatus: EmployerRiskStatus.GOOD,
      userId: employerUser.id,
    },
  });

  const existingEnquiry = await prisma.employerEnquiry.findFirst({
    where: {
      email: EMPLOYER_EMAIL,
    },
  });

  if (existingEnquiry) {
    await prisma.employerEnquiry.update({
      where: {
        id: existingEnquiry.id,
      },
      data: {
        status: 'ONBOARDED',
        employerId: employer.id,
        remarks: 'Converted through demo seed',
      },
    });
  } else {
    await prisma.employerEnquiry.create({
      data: {
        companyName: employer.companyName,
        contactPerson: employer.contactPerson,
        email: EMPLOYER_EMAIL,
        phone: employer.phone,
        employeeCount: 10,
        status: 'ONBOARDED',
        employerId: employer.id,
        remarks: 'Converted through demo seed',
      },
    });
  }

  await upsertAuditLog('demo-audit-employer-active', adminUserId, {
    action: 'EMPLOYER_ACTIVATED',
    entityType: 'EMPLOYER',
    entityId: employer.id,
    oldValue: { status: EmployerStatus.PENDING },
    newValue: { status: EmployerStatus.ACTIVE },
  });

  return employer;
}

type DemoEmployeeSeed = {
  code: string;
  name: string;
  phone: string;
  salary: number;
  employmentStatus: EmployeeStatus;
  appActivated: boolean;
  selfieStatus: SelfieStatus;
  kyc: Partial<Record<KycDocumentType, KycStatus>>;
  bankVerified: boolean;
  membershipStatus: MembershipStatus;
};

const employees: DemoEmployeeSeed[] = [
  {
    code: 'EMP001',
    name: 'Arjun Sharma',
    phone: '+91 98765 43101',
    salary: 54000,
    employmentStatus: EmployeeStatus.ACTIVE,
    appActivated: true,
    selfieStatus: SelfieStatus.VERIFIED,
    kyc: {
      PAN: KycStatus.VERIFIED,
      AADHAR: KycStatus.VERIFIED,
      SALARY_SLIP: KycStatus.VERIFIED,
    },
    bankVerified: true,
    membershipStatus: MembershipStatus.ACTIVE,
  },
  {
    code: 'EMP002',
    name: 'Priya Nair',
    phone: '+91 98765 43102',
    salary: 62000,
    employmentStatus: EmployeeStatus.ACTIVE,
    appActivated: true,
    selfieStatus: SelfieStatus.PENDING,
    kyc: {
      PAN: KycStatus.VERIFIED,
      AADHAR: KycStatus.PENDING,
      SALARY_SLIP: KycStatus.PENDING,
    },
    bankVerified: false,
    membershipStatus: MembershipStatus.PENDING,
  },
  {
    code: 'EMP003',
    name: 'Kabir Khan',
    phone: '+91 98765 43103',
    salary: 47000,
    employmentStatus: EmployeeStatus.ACTIVE,
    appActivated: true,
    selfieStatus: SelfieStatus.VERIFIED,
    kyc: {
      PAN: KycStatus.VERIFIED,
      AADHAR: KycStatus.VERIFIED,
      SALARY_SLIP: KycStatus.VERIFIED,
    },
    bankVerified: true,
    membershipStatus: MembershipStatus.ACTIVE,
  },
  {
    code: 'EMP004',
    name: 'Ananya Rao',
    phone: '+91 98765 43104',
    salary: 73500,
    employmentStatus: EmployeeStatus.ACTIVE,
    appActivated: true,
    selfieStatus: SelfieStatus.REJECTED,
    kyc: {
      PAN: KycStatus.VERIFIED,
      AADHAR: KycStatus.REJECTED,
      SALARY_SLIP: KycStatus.VERIFIED,
    },
    bankVerified: true,
    membershipStatus: MembershipStatus.REJECTED,
  },
  {
    code: 'EMP005',
    name: 'Vikram Singh',
    phone: '+91 98765 43105',
    salary: 51000,
    employmentStatus: EmployeeStatus.ACTIVE,
    appActivated: true,
    selfieStatus: SelfieStatus.VERIFIED,
    kyc: {
      PAN: KycStatus.VERIFIED,
      AADHAR: KycStatus.VERIFIED,
      SALARY_SLIP: KycStatus.VERIFIED,
    },
    bankVerified: true,
    membershipStatus: MembershipStatus.ACTIVE,
  },
  {
    code: 'EMP006',
    name: 'Meera Iyer',
    phone: '+91 98765 43106',
    salary: 68000,
    employmentStatus: EmployeeStatus.ACTIVE,
    appActivated: true,
    selfieStatus: SelfieStatus.VERIFIED,
    kyc: {
      PAN: KycStatus.VERIFIED,
      AADHAR: KycStatus.VERIFIED,
      SALARY_SLIP: KycStatus.VERIFIED,
    },
    bankVerified: true,
    membershipStatus: MembershipStatus.ACTIVE,
  },
  {
    code: 'EMP007',
    name: 'Ritika Das',
    phone: '+91 98765 43107',
    salary: 39000,
    employmentStatus: EmployeeStatus.ACTIVE,
    appActivated: false,
    selfieStatus: SelfieStatus.PENDING,
    kyc: {
      PAN: KycStatus.PENDING,
    },
    bankVerified: false,
    membershipStatus: MembershipStatus.PENDING,
  },
  {
    code: 'EMP008',
    name: 'Nikhil Menon',
    phone: '+91 98765 43108',
    salary: 82000,
    employmentStatus: EmployeeStatus.ACTIVE,
    appActivated: true,
    selfieStatus: SelfieStatus.VERIFIED,
    kyc: {
      PAN: KycStatus.VERIFIED,
      AADHAR: KycStatus.VERIFIED,
      SALARY_SLIP: KycStatus.VERIFIED,
    },
    bankVerified: true,
    membershipStatus: MembershipStatus.ACTIVE,
  },
  {
    code: 'EMP009',
    name: 'Sara Thomas',
    phone: '+91 98765 43109',
    salary: 58500,
    employmentStatus: EmployeeStatus.INACTIVE,
    appActivated: false,
    selfieStatus: SelfieStatus.PENDING,
    kyc: {},
    bankVerified: false,
    membershipStatus: MembershipStatus.EXPIRED,
  },
  {
    code: 'EMP010',
    name: 'Dev Patel',
    phone: '+91 98765 43110',
    salary: 45500,
    employmentStatus: EmployeeStatus.ACTIVE,
    appActivated: true,
    selfieStatus: SelfieStatus.VERIFIED,
    kyc: {
      PAN: KycStatus.VERIFIED,
      AADHAR: KycStatus.VERIFIED,
      SALARY_SLIP: KycStatus.VERIFIED,
    },
    bankVerified: false,
    membershipStatus: MembershipStatus.ACTIVE,
  },
];

async function seedEmployees(employerId: string, adminUserId: string) {
  const seeded: { id: string; employeeCode: string }[] = [];

  for (const [index, employeeSeed] of employees.entries()) {
    const email = `${employeeSeed.code.toLowerCase()}@northstar.mobpae.com`;
    const user = await upsertUser(email, Role.EMPLOYEE, DEMO_PASSWORD);
    const verifiedAt =
      employeeSeed.selfieStatus === SelfieStatus.VERIFIED ? addDays(-8) : null;

    const employee = await prisma.employee.upsert({
      where: {
        employerId_employeeCode: {
          employerId,
          employeeCode: employeeSeed.code,
        },
      },
      update: {
        userId: user.id,
        name: employeeSeed.name,
        email,
        phone: employeeSeed.phone,
        salaryInHand: employeeSeed.salary,
        appActivated: employeeSeed.appActivated,
        employmentStatus: employeeSeed.employmentStatus,
        profilePhotoUrl: `uploads/demo/${employeeSeed.code.toLowerCase()}-profile.png`,
        selfieUrl:
          employeeSeed.selfieStatus === SelfieStatus.PENDING &&
          Object.keys(employeeSeed.kyc).length === 0
            ? null
            : `uploads/demo/${employeeSeed.code.toLowerCase()}-selfie.png`,
        selfieStatus: employeeSeed.selfieStatus,
        selfieVerifiedAt: verifiedAt,
        selfieVerifiedBy: verifiedAt ? adminUserId : null,
        joiningDate: addDays(-120 + index * 4),
      },
      create: {
        userId: user.id,
        employerId,
        employeeCode: employeeSeed.code,
        name: employeeSeed.name,
        email,
        phone: employeeSeed.phone,
        salaryInHand: employeeSeed.salary,
        appActivated: employeeSeed.appActivated,
        employmentStatus: employeeSeed.employmentStatus,
        profilePhotoUrl: `uploads/demo/${employeeSeed.code.toLowerCase()}-profile.png`,
        selfieUrl:
          employeeSeed.selfieStatus === SelfieStatus.PENDING &&
          Object.keys(employeeSeed.kyc).length === 0
            ? null
            : `uploads/demo/${employeeSeed.code.toLowerCase()}-selfie.png`,
        selfieStatus: employeeSeed.selfieStatus,
        selfieVerifiedAt: verifiedAt,
        selfieVerifiedBy: verifiedAt ? adminUserId : null,
        joiningDate: addDays(-120 + index * 4),
      },
    });

    await seedEmployeeKyc(employee.id, employeeSeed.kyc, adminUserId);
    await seedBankAccount(employee.id, employeeSeed);
    await seedMembership(
      employee.id,
      employeeSeed.membershipStatus,
      adminUserId,
    );
    await seedSalaryLimit(employee.id, employeeSeed.salary);
    await upsertAuditLog(
      `demo-audit-${employeeSeed.code.toLowerCase()}`,
      adminUserId,
      {
        action: 'EMPLOYEE_CREATED',
        entityType: 'EMPLOYEE',
        entityId: employee.id,
        newValue: {
          employeeCode: employee.employeeCode,
          name: employee.name,
          email: employee.email,
        },
      },
    );

    seeded.push(employee);
  }

  return seeded;
}

async function seedEmployeeKyc(
  employeeId: string,
  kyc: Partial<Record<KycDocumentType, KycStatus>>,
  adminUserId: string,
) {
  for (const documentType of [
    KycDocumentType.PAN,
    KycDocumentType.AADHAR,
    KycDocumentType.SALARY_SLIP,
  ]) {
    const status = kyc[documentType];

    if (!status) {
      await prisma.kycDocument.deleteMany({
        where: {
          employeeId,
          documentType,
        },
      });
      continue;
    }

    await prisma.kycDocument.upsert({
      where: {
        employeeId_documentType: {
          employeeId,
          documentType,
        },
      },
      update: {
        filePath: `uploads/demo/${employeeId}-${documentType.toLowerCase()}.pdf`,
        status,
        verifiedBy: status === KycStatus.VERIFIED ? adminUserId : null,
        verifiedAt: status === KycStatus.VERIFIED ? addDays(-7) : null,
      },
      create: {
        employeeId,
        documentType,
        filePath: `uploads/demo/${employeeId}-${documentType.toLowerCase()}.pdf`,
        status,
        verifiedBy: status === KycStatus.VERIFIED ? adminUserId : null,
        verifiedAt: status === KycStatus.VERIFIED ? addDays(-7) : null,
      },
    });
  }
}

async function seedBankAccount(
  employeeId: string,
  employeeSeed: DemoEmployeeSeed,
) {
  await prisma.employeeBankAccount.upsert({
    where: {
      employeeId,
    },
    update: {
      accountHolderName: employeeSeed.name,
      accountNumber: `50123456${employeeSeed.code.slice(-3)}`,
      ifscCode: 'HDFC0001234',
      bankName: 'HDFC Bank',
      upiId: `${employeeSeed.code.toLowerCase()}@okhdfcbank`,
      verified: employeeSeed.bankVerified,
    },
    create: {
      employeeId,
      accountHolderName: employeeSeed.name,
      accountNumber: `50123456${employeeSeed.code.slice(-3)}`,
      ifscCode: 'HDFC0001234',
      bankName: 'HDFC Bank',
      upiId: `${employeeSeed.code.toLowerCase()}@okhdfcbank`,
      verified: employeeSeed.bankVerified,
    },
  });
}

async function seedMembership(
  employeeId: string,
  status: MembershipStatus,
  adminUserId: string,
) {
  const startDate =
    status === MembershipStatus.EXPIRED ? addDays(-430) : addDays(-45);
  const endDate =
    status === MembershipStatus.EXPIRED ? addDays(-30) : addDays(320);

  await prisma.membership.upsert({
    where: {
      employeeId,
    },
    update: {
      planName: 'Annual Membership',
      amount: status === MembershipStatus.ACTIVE ? 449 : 0,
      startDate,
      endDate,
      status,
      verifiedBy: status === MembershipStatus.ACTIVE ? adminUserId : null,
      verifiedAt: status === MembershipStatus.ACTIVE ? addDays(-45) : null,
      paymentReference:
        status === MembershipStatus.ACTIVE
          ? `DEMO-MEM-${employeeId.slice(0, 8)}`
          : null,
      paymentScreenshot:
        status === MembershipStatus.ACTIVE
          ? `uploads/demo/membership-${employeeId.slice(0, 8)}.png`
          : null,
      remarks:
        status === MembershipStatus.REJECTED
          ? 'Demo rejected membership request'
          : null,
    },
    create: {
      employeeId,
      planName: 'Annual Membership',
      amount: status === MembershipStatus.ACTIVE ? 449 : 0,
      startDate,
      endDate,
      status,
      verifiedBy: status === MembershipStatus.ACTIVE ? adminUserId : null,
      verifiedAt: status === MembershipStatus.ACTIVE ? addDays(-45) : null,
      paymentReference:
        status === MembershipStatus.ACTIVE
          ? `DEMO-MEM-${employeeId.slice(0, 8)}`
          : null,
      paymentScreenshot:
        status === MembershipStatus.ACTIVE
          ? `uploads/demo/membership-${employeeId.slice(0, 8)}.png`
          : null,
      remarks:
        status === MembershipStatus.REJECTED
          ? 'Demo rejected membership request'
          : null,
    },
  });
}

async function seedSalaryLimit(employeeId: string, salary: number) {
  await prisma.salaryLimit.upsert({
    where: {
      employeeId,
    },
    update: {
      approvedLimit: Math.min(salary * 0.1, 10000),
      maxRequestsPerCycle: 1,
      cooldownDays: 0,
    },
    create: {
      employeeId,
      approvedLimit: Math.min(salary * 0.1, 10000),
      maxRequestsPerCycle: 1,
      cooldownDays: 0,
    },
  });
}

async function seedSalaryWorkflows(
  employerId: string,
  seededEmployees: { id: string; employeeCode: string }[],
  adminUserId: string,
  employerUserId: string,
) {
  const workflow: {
    id: string;
    employeeCode: string;
    amount: number;
    status: SalaryRequestStatus;
    requestedAt: Date;
    approvedAt?: Date;
  }[] = [
    {
      id: 'demo-salary-request-submitted',
      employeeCode: 'EMP001',
      amount: 5000,
      status: SalaryRequestStatus.SUBMITTED,
      requestedAt: addDays(-1),
    },
    {
      id: 'demo-salary-request-approved',
      employeeCode: 'EMP003',
      amount: 4200,
      status: SalaryRequestStatus.EMPLOYER_APPROVED,
      requestedAt: addDays(-3),
      approvedAt: addDays(-2),
    },
    {
      id: 'demo-salary-request-ready',
      employeeCode: 'EMP005',
      amount: 5000,
      status: SalaryRequestStatus.READY_FOR_DISBURSAL,
      requestedAt: addDays(-5),
      approvedAt: addDays(-4),
    },
    {
      id: 'demo-salary-request-disbursed',
      employeeCode: 'EMP006',
      amount: 6500,
      status: SalaryRequestStatus.DISBURSED,
      requestedAt: addDays(-10),
      approvedAt: addDays(-9),
    },
    {
      id: 'demo-salary-request-repaid',
      employeeCode: 'EMP008',
      amount: 8000,
      status: SalaryRequestStatus.REPAID,
      requestedAt: addDays(-40),
      approvedAt: addDays(-39),
    },
  ];

  for (const item of workflow) {
    const employee = seededEmployees.find(
      (record) => record.employeeCode === item.employeeCode,
    );

    if (!employee) continue;

    const salaryRequest = await prisma.salaryRequest.upsert({
      where: {
        id: item.id,
      },
      update: {
        employeeId: employee.id,
        employerId,
        amount: item.amount,
        approvedAmount:
          item.status === SalaryRequestStatus.SUBMITTED ? null : item.amount,
        approvedBy:
          item.status === SalaryRequestStatus.SUBMITTED ? null : employerUserId,
        approvedAt: item.approvedAt ?? null,
        requestedAt: item.requestedAt,
        repaymentDate:
          item.status === SalaryRequestStatus.SUBMITTED ? null : addDays(14),
        status: item.status,
        reason: 'Demo salary advance',
        remarks: null,
      },
      create: {
        id: item.id,
        employeeId: employee.id,
        employerId,
        amount: item.amount,
        approvedAmount:
          item.status === SalaryRequestStatus.SUBMITTED ? null : item.amount,
        approvedBy:
          item.status === SalaryRequestStatus.SUBMITTED ? null : employerUserId,
        approvedAt: item.approvedAt ?? null,
        requestedAt: item.requestedAt,
        repaymentDate:
          item.status === SalaryRequestStatus.SUBMITTED ? null : addDays(14),
        status: item.status,
        reason: 'Demo salary advance',
      },
    });

    await upsertAuditLog(`demo-audit-${item.id}`, employerUserId, {
      action:
        item.status === SalaryRequestStatus.SUBMITTED
          ? 'SALARY_REQUEST_CREATED'
          : 'SALARY_REQUEST_APPROVED',
      entityType: 'SALARY_REQUEST',
      entityId: salaryRequest.id,
      newValue: {
        amount: Number(salaryRequest.amount),
        status: salaryRequest.status,
      },
    });

    const statusesWithDisbursal: SalaryRequestStatus[] = [
      SalaryRequestStatus.READY_FOR_DISBURSAL,
      SalaryRequestStatus.DISBURSED,
      SalaryRequestStatus.REPAID,
    ];

    if (statusesWithDisbursal.includes(item.status)) {
      await seedDisbursalAndRepayment(salaryRequest, adminUserId);
    }
  }
}

async function seedDisbursalAndRepayment(
  salaryRequest: {
    id: string;
    amount: unknown;
    status: SalaryRequestStatus;
  },
  adminUserId: string,
) {
  const disbursedStatuses: SalaryRequestStatus[] = [
    SalaryRequestStatus.DISBURSED,
    SalaryRequestStatus.REPAID,
  ];
  const shouldBeDisbursed = disbursedStatuses.includes(salaryRequest.status);
  const disbursalStatus = shouldBeDisbursed
    ? DisbursalStatus.DISBURSED
    : DisbursalStatus.PENDING;

  await prisma.disbursal.upsert({
    where: {
      salaryRequestId: salaryRequest.id,
    },
    update: {
      amount: Number(salaryRequest.amount),
      disbursedBy: shouldBeDisbursed ? adminUserId : null,
      disbursedAt: shouldBeDisbursed ? addDays(-8) : null,
      status: disbursalStatus,
      remarks: shouldBeDisbursed
        ? 'Demo disbursal completed'
        : 'Awaiting payout',
    },
    create: {
      salaryRequestId: salaryRequest.id,
      amount: Number(salaryRequest.amount),
      disbursedBy: shouldBeDisbursed ? adminUserId : null,
      disbursedAt: shouldBeDisbursed ? addDays(-8) : null,
      status: disbursalStatus,
      remarks: shouldBeDisbursed
        ? 'Demo disbursal completed'
        : 'Awaiting payout',
    },
  });

  if (!shouldBeDisbursed) return;

  const principal = Number(salaryRequest.amount);
  const interest = Number((principal * 0.01).toFixed(2));
  const total = principal + interest;
  const paid = salaryRequest.status === SalaryRequestStatus.REPAID;

  await prisma.repayment.upsert({
    where: {
      salaryRequestId: salaryRequest.id,
    },
    update: {
      dueDate: paid ? addDays(-12) : addDays(10),
      paidDate: paid ? addDays(-10) : null,
      status: paid ? RepaymentStatus.PAID : RepaymentStatus.SCHEDULED,
      principalAmount: principal,
      interestAmount: interest,
      totalAmount: total,
      interestRate: 36,
      interestDays: 10,
      remarks: paid ? 'Recovered through payroll' : 'Scheduled for payroll',
    },
    create: {
      salaryRequestId: salaryRequest.id,
      dueDate: paid ? addDays(-12) : addDays(10),
      paidDate: paid ? addDays(-10) : null,
      status: paid ? RepaymentStatus.PAID : RepaymentStatus.SCHEDULED,
      principalAmount: principal,
      interestAmount: interest,
      totalAmount: total,
      interestRate: 36,
      interestDays: 10,
      remarks: paid ? 'Recovered through payroll' : 'Scheduled for payroll',
    },
  });

  await upsertAuditLog(
    `demo-audit-disbursed-${salaryRequest.id}`,
    adminUserId,
    {
      action: 'DISBURSAL_DISBURSED',
      entityType: 'DISBURSAL',
      entityId: salaryRequest.id,
      newValue: {
        amount: principal,
        status: disbursalStatus,
      },
    },
  );
}

async function seedSettlements(employerId: string, adminUserId: string) {
  const settlements = [
    {
      payrollMonth: isoMonth(-1),
      status: EmployerSettlementStatus.PAID,
      paidDate: addDays(-8),
      referenceNumber: 'UTR-DEMO-PAID-001',
      outstandingAmount: 0,
      principalAmount: 8000,
      interestAmount: 80,
    },
    {
      payrollMonth: isoMonth(0),
      status: EmployerSettlementStatus.PENDING,
      paidDate: null,
      referenceNumber: null,
      outstandingAmount: 6550,
      principalAmount: 6500,
      interestAmount: 50,
    },
    {
      payrollMonth: isoMonth(1),
      status: EmployerSettlementStatus.PENDING,
      paidDate: null,
      referenceNumber: null,
      outstandingAmount: 0,
      principalAmount: 0,
      interestAmount: 0,
    },
  ];

  for (const settlement of settlements) {
    const totalAmount =
      settlement.principalAmount + settlement.interestAmount + 0;

    const record = await prisma.employerSettlement.upsert({
      where: {
        employerId_payrollMonth: {
          employerId,
          payrollMonth: settlement.payrollMonth,
        },
      },
      update: {
        principalAmount: settlement.principalAmount,
        interestAmount: settlement.interestAmount,
        lateFeeAmount: 0,
        totalAmount,
        outstandingAmount: settlement.outstandingAmount,
        dueDate:
          settlement.status === EmployerSettlementStatus.PAID
            ? addDays(-12)
            : addDays(10),
        paidDate: settlement.paidDate,
        status: settlement.status,
        referenceNumber: settlement.referenceNumber,
        notes: 'Demo settlement generated by seed',
      },
      create: {
        employerId,
        payrollMonth: settlement.payrollMonth,
        principalAmount: settlement.principalAmount,
        interestAmount: settlement.interestAmount,
        lateFeeAmount: 0,
        totalAmount,
        outstandingAmount: settlement.outstandingAmount,
        dueDate:
          settlement.status === EmployerSettlementStatus.PAID
            ? addDays(-12)
            : addDays(10),
        paidDate: settlement.paidDate,
        status: settlement.status,
        referenceNumber: settlement.referenceNumber,
        notes: 'Demo settlement generated by seed',
      },
    });

    await upsertAuditLog(
      `demo-audit-settlement-${settlement.payrollMonth}`,
      adminUserId,
      {
        action:
          settlement.status === EmployerSettlementStatus.PAID
            ? 'SETTLEMENT_PAID'
            : 'SETTLEMENT_GENERATED',
        entityType: 'SETTLEMENT',
        entityId: record.id,
        newValue: {
          payrollMonth: record.payrollMonth,
          status: record.status,
          outstandingAmount: Number(record.outstandingAmount),
        },
      },
    );
  }
}

async function seedNotifications(adminUserId: string, employerUserId: string) {
  const notifications = [
    {
      id: 'demo-notification-admin-kyc',
      userId: adminUserId,
      title: 'KYC review queue',
      message: 'Three demo employees have pending or rejected KYC documents.',
    },
    {
      id: 'demo-notification-admin-salary',
      userId: adminUserId,
      title: 'Disbursal ready',
      message: 'One salary advance is ready for admin disbursal.',
    },
    {
      id: 'demo-notification-employer-request',
      userId: employerUserId,
      title: 'Salary request pending',
      message: 'Arjun Sharma submitted a salary advance request.',
    },
  ];

  for (const notification of notifications) {
    await prisma.notification.upsert({
      where: {
        id: notification.id,
      },
      update: {
        userId: notification.userId,
        title: notification.title,
        message: notification.message,
        type: NotificationType.SYSTEM,
        isRead: false,
      },
      create: {
        ...notification,
        type: NotificationType.SYSTEM,
        isRead: false,
      },
    });
  }
}

async function upsertAuditLog(
  id: string,
  userId: string | null,
  data: {
    action: string;
    entityType: string;
    entityId: string;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
  },
) {
  const auditData: {
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    oldValue?: Prisma.InputJsonObject;
    newValue?: Prisma.InputJsonObject;
  } = {
    userId,
    action: data.action,
    entityType: data.entityType,
    entityId: data.entityId,
  };

  if (data.oldValue) {
    auditData.oldValue = data.oldValue as Prisma.InputJsonObject;
  }

  if (data.newValue) {
    auditData.newValue = data.newValue as Prisma.InputJsonObject;
  }

  await prisma.auditLog.upsert({
    where: {
      id,
    },
    update: auditData,
    create: {
      id,
      ...auditData,
    },
  });
}

async function seedAppInformation() {
  const entries: Array<{
    type: AppInfoType;
    title: string;
    content: string;
    version: string;
  }> = [
    {
      type: AppInfoType.ABOUT,
      title: 'About MobPae',
      version: '1.0.0',
      content: `MobPae is a salary advance platform that empowers employees to access a portion of their earned salary before payday — instantly, securely, and without any hidden charges.

We partner with employers to offer this benefit as part of their employee wellness programme. Once your employer is onboarded, you can request an advance in minutes directly from the MobPae app.

**Our Mission**
To eliminate financial stress for working India by making salary advances simple, transparent, and accessible to every employee.

**How We Work**
MobPae works with your employer to offer salary advances against your earned salary. The advance amount is automatically deducted from your next salary, so there is nothing extra to pay separately.

**Contact**
Email: support@mobpae.com
Website: https://mobpae.com`,
    },
    {
      type: AppInfoType.PRIVACY_POLICY,
      title: 'Privacy Policy',
      version: '1.0.0',
      content: `Last updated: June 2026

MobPae ("we", "our", "us") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and services.

**Information We Collect**
- Personal identification: name, email address, phone number, employee code
- Financial information: salary details, bank account information (for disbursal and repayment)
- KYC documents: Aadhaar, PAN card, salary slips as required by law
- Selfie / photo for identity verification
- Device and usage data to improve the app experience

**How We Use Your Information**
- To process salary advance requests
- To verify your identity and comply with KYC regulations
- To communicate important updates about your requests
- To improve our products and services

**Data Security**
We implement industry-standard security measures to protect your personal data. All sensitive data is encrypted in transit and at rest.

**Data Sharing**
We share your data only with your employer (for advance processing) and with regulated financial partners. We never sell your personal data to third parties.

**Your Rights**
You may request access to, correction of, or deletion of your personal data by contacting us at support@mobpae.com.

**Contact**
For privacy-related queries, email us at support@mobpae.com.`,
    },
    {
      type: AppInfoType.TERMS_CONDITIONS,
      title: 'Terms & Conditions',
      version: '1.0.0',
      content: `Last updated: June 2026

Please read these Terms and Conditions carefully before using the MobPae application.

**1. Acceptance of Terms**
By accessing or using MobPae, you agree to be bound by these Terms. If you do not agree, please do not use the app.

**2. Eligibility**
You must be an employee of an employer that has been onboarded with MobPae and must have completed KYC verification to use salary advance services.

**3. Salary Advance**
- Advances are limited to a percentage of your salary as configured by your employer and MobPae.
- Interest is charged on the advance amount from the request date to the repayment date, at the applicable annual rate displayed in the app.
- Repayment is automatically deducted from your salary on the next payroll date.

**4. Membership**
Access to salary advances requires an active MobPae membership. Membership is subject to fees and validity periods displayed in the app.

**5. KYC and Verification**
You must provide accurate and up-to-date KYC documents. Providing false information may result in suspension of your account.

**6. Prohibited Use**
You may not use MobPae for any unlawful purpose or in violation of any applicable regulations.

**7. Limitation of Liability**
MobPae shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.

**8. Changes to Terms**
We reserve the right to modify these Terms at any time. Continued use of the app after changes constitutes acceptance.

**Contact**
For questions about these Terms, contact us at support@mobpae.com.`,
    },
    {
      type: AppInfoType.HOW_IT_WORKS,
      title: 'How It Works',
      version: '1.0.0',
      content: `Getting a salary advance with MobPae is simple and takes just a few minutes.

**Step 1 — Sign Up**
Your employer will send you an invitation to join MobPae. Download the app and log in with the credentials provided.

**Step 2 — Complete KYC**
Upload your Aadhaar, PAN card, and a recent salary slip. Our team reviews documents within 24 hours.

**Step 3 — Add Bank Account**
Link your bank account where you want the advance to be credited.

**Step 4 — Activate Membership**
Activate your MobPae membership to unlock salary advances.

**Step 5 — Request an Advance**
Select the amount you need (up to your approved limit), review the repayment details, and submit. Your employer approves the request.

**Step 6 — Receive Money**
Once approved, the advance is disbursed directly to your bank account.

**Step 7 — Automatic Repayment**
The advance plus applicable interest is automatically deducted from your next salary. No action needed from your side.`,
    },
    {
      type: AppInfoType.FAQ,
      title: 'Frequently Asked Questions',
      version: '1.0.0',
      content: `**Q: Who can use MobPae?**
A: Any employee whose employer is registered and active on the MobPae platform. You will receive an invitation from your employer to join.

**Q: How much can I borrow?**
A: The advance limit is based on your salary and your employer's policy — typically up to 10% of your monthly salary, subject to a maximum limit.

**Q: What are the charges?**
A: MobPae charges a simple annual interest rate on the advance amount, calculated for the number of days between your request date and your payday. There are no processing fees or hidden charges.

**Q: When is the advance repaid?**
A: The advance (principal + interest) is automatically deducted from your salary on the next payroll date. You do not need to transfer money separately.

**Q: What documents do I need?**
A: Aadhaar card, PAN card, and latest salary slip.

**Q: How long does verification take?**
A: KYC verification is typically completed within 24 hours of document submission.

**Q: Can I take multiple advances?**
A: Only one active advance is allowed at a time. Once your existing advance is fully repaid, you can apply for another.

**Q: What if my request is rejected?**
A: Your employer reviews and approves requests. If rejected, you will receive a notification with the reason. You can reapply once any issues are resolved.

**Q: Is my data safe?**
A: Yes. All data is encrypted and stored securely. We never share your personal information with third parties except as required to process your advance.

**Q: How do I contact support?**
A: Email us at support@mobpae.com and our team will respond within one business day.`,
    },
    {
      type: AppInfoType.CONTACT,
      title: 'Contact & Support',
      version: '1.0.0',
      content: `We are here to help. Reach out to us through any of the following channels.

**Email Support**
support@mobpae.com
Response time: within 1 business day

**Business Hours**
Monday – Friday: 9:00 AM – 6:00 PM IST
Saturday: 10:00 AM – 2:00 PM IST
Sunday: Closed

**Website**
https://mobpae.com

**For Employers**
If you are an employer and want to onboard your company to MobPae, please submit an enquiry on our website or email us at support@mobpae.com.`,
    },
    {
      type: AppInfoType.WHATS_NEW,
      title: "What's New",
      version: '2.0.0',
      content: `**Version 2.0.0 — June 2026**

- New app design with improved navigation
- Faster KYC verification
- Advance calculator with real-time repayment preview
- Improved notification centre
- Profile photo upload
- Bug fixes and performance improvements

**Version 1.0.0 — January 2026**

- Initial launch
- Salary advance requests
- KYC document upload
- Bank account linking
- Membership activation`,
    },
  ];

  // Cast needed until `npx prisma generate` is run locally after migration
  const db = (prisma as any).appInformation;
  for (const entry of entries) {
    await db.upsert({
      where: { type: entry.type },
      update: { title: entry.title, content: entry.content, version: entry.version, isActive: true },
      create: { type: entry.type, title: entry.title, content: entry.content, version: entry.version, isActive: true },
    });
  }

  console.log('App information seeded.');
}

async function main() {
  console.log('Seeding MobPae demo data...');

  const admin = await upsertUser(ADMIN_EMAIL, Role.ADMIN, ADMIN_PASSWORD);
  await seedSettings();

  const employer = await seedEmployer(admin.id);
  const employerUser = await prisma.user.findUniqueOrThrow({
    where: {
      email: EMPLOYER_EMAIL,
    },
  });
  const seededEmployees = await seedEmployees(employer.id, admin.id);

  await seedSalaryWorkflows(
    employer.id,
    seededEmployees,
    admin.id,
    employerUser.id,
  );
  await seedSettlements(employer.id, admin.id);
  await seedNotifications(admin.id, employerUser.id);
  await seedAppInformation();

  console.log('Demo seed complete.');
  console.log(`Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`Employer: ${EMPLOYER_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(
    'Employees: emp001@northstar.mobpae.com ... emp010@northstar.mobpae.com / Demo@1234',
  );
}

main()
  .catch((error) => {
    console.error('Seed failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
