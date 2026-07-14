/**
 * MobPae Seed — v3.1 Lending Platform
 *
 * Idempotent: safe to run multiple times.
 * Run: npx prisma db seed
 *
 * What this seeds:
 * 1. Admin user
 * 2. Global platform Settings (OTP TTL, app version, maintenance)
 * 3. AppInformation (about, terms, FAQ, etc.)
 * 4. LoanProduct — Salary Advance (SA)
 * 5. LoanProductConfig v1 for SA
 * 6. PostgreSQL sequence: loan_application_seq
 * 7. Demo employer + employees + KYC + bank accounts
 * 8. EmployerProductConfig for demo employer
 * 9. LoanLimits
 * 10. Demo LoanApplications + Platform Fees + Disbursals + Repayments
 * 11. Demo EmployerSettlements + Notifications
 */

import {
  DisbursalStatus,
  EmployeeStatus,
  EmployerRiskStatus,
  EmployerSettlementStatus,
  EmployerStatus,
  KycDocumentType,
  KycStatus,
  LoanApplicationStatus,
  LoanApplicationFeeStatus,
  LoanApplicationFeeType,
  NotificationType,
  PaymentOrderPurpose,
  PaymentOrderStatus,
  Prisma,
  PrismaClient,
  RepaymentStatus,
  Role,
  SelfieStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { normalizeEmail } from '../src/common/utils/email.util';

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
  const normalizedEmail = normalizeEmail(email);
  return prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      role,
      isActive: true,
      password: await bcrypt.hash(password, 10),
      passwordChanged: true,
    },
    create: {
      email: normalizedEmail,
      role,
      isActive: true,
      password: await bcrypt.hash(password, 10),
      passwordChanged: true,
    },
  });
}

// ── 2. Global Settings ──────────────────────────────────────────────────────
async function seedSettings() {
  // Only global / platform-level settings. No lending rules — those live in LoanProductConfig.
  const settings: { key: string; value: string }[] = [
    { key: 'otp.ttl_seconds', value: '300' },
    { key: 'otp.max_attempts', value: '5' },
    { key: 'app.version_android', value: '2.0.0' },
    { key: 'app.version_ios', value: '2.0.0' },
    { key: 'app.maintenance_mode', value: 'false' },
    {
      key: 'app.maintenance_message',
      value: 'We are currently under maintenance. Please try again shortly.',
    },
    { key: 'notifications.disbursal_enabled', value: 'true' },
    { key: 'notifications.repayment_reminder_enabled', value: 'true' },
    { key: 'notifications.repayment_reminder_days_before', value: '3' },
    { key: 'employer.grace_days', value: '3' },
    { key: 'employer.late_fee_percentage', value: '30' },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log(`  ✓ ${settings.length} global settings`);
}

// ── 4 & 5. LoanProduct + LoanProductConfig ──────────────────────────────────
async function seedLendingCatalog() {
  const saProduct = await prisma.loanProduct.upsert({
    where: { productType: 'SA' },
    update: {},
    create: {
      productType: 'SA',
      displayName: 'Salary Advance',
      description:
        'Access a portion of your earned salary before payday. Fast, transparent, employer-linked.',
      isActive: true,
      launchDate: new Date('2026-07-01'),
    },
  });
  console.log(`  ✓ LoanProduct: ${saProduct.displayName}`);

  const existingActiveConfig = await prisma.loanProductConfig.findFirst({
    where: { productId: saProduct.id, isActive: true },
  });

  if (!existingActiveConfig) {
    await prisma.loanProductConfig.create({
      data: {
        productId: saProduct.id,
        versionNumber: 1,
        versionName: 'MVP Launch v1',
        isActive: true,
        effectiveFrom: new Date('2026-07-01'),
        eligibilityRules: {
          platformAdvancePercentage: 10,
          platformMaxAdvanceAmount: 5000,
          hardCeilingPercentage: 50,
          minimumAdvanceAmount: 1000,
          minimumSalaryInHand: 10000,
          minimumTenureMonths: 3,
          requiresKyc: true,
          requiresBankAccount: true,
          requiresActiveSelfie: false,
          maxRequestsPerCycle: 1,
          cooldownDays: 0,
        },
        pricingRules: {
          annualInterestRate: 36,
          processingFeeRate: 0,
          gstRate: 0,
          platformFeeAmount: 175,
          platformFeeCurrency: 'INR',
        },
        operationalRules: {
          requiresEmployerApproval: true,
          requiresAdminApproval: true,
          minDisbursalDays: 0,
          maxDisbursalDays: 3,
          defaultFundingSource: 'MOBPAE',
        },
        createdBy: 'SEED',
      },
    });
    console.log('  ✓ LoanProductConfig: SA v1 (active)');
  } else {
    console.log('  – LoanProductConfig: SA active config already exists');
  }

  return saProduct;
}

// ── 6. PostgreSQL sequence ───────────────────────────────────────────────────
async function seedSequence() {
  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS loan_application_seq START 1 INCREMENT 1`,
  );
  console.log('  ✓ PostgreSQL sequence: loan_application_seq');
}

// ── 8. Demo employer ─────────────────────────────────────────────────────────
async function seedEmployer(adminUserId: string) {
  const employerUser = await upsertUser(EMPLOYER_EMAIL, Role.EMPLOYER, DEMO_PASSWORD);

  const employer = await prisma.employer.upsert({
    where: { companyCode: 'NORTHSTAR' },
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
    where: { email: EMPLOYER_EMAIL },
  });

  if (existingEnquiry) {
    await prisma.employerEnquiry.update({
      where: { id: existingEnquiry.id },
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
    newValue: { status: EmployerStatus.ACTIVE },
  });

  return employer;
}

// ── 9. EmployerProductConfig ─────────────────────────────────────────────────
async function seedEmployerProductConfig(employerId: string, productId: string) {
  await prisma.employerProductConfig.upsert({
    where: { employerId_productId: { employerId, productId } },
    update: {},
    create: {
      employerId,
      productId,
      maximumAdvanceAmountOverride: null, // use platform default: min(salary×10%, ₹5000)
      requiresEmployerApproval: true,
      isEnabled: true,
    },
  });
  console.log('  ✓ EmployerProductConfig for Northstar (SA)');
}

// ── 10. Employees ────────────────────────────────────────────────────────────
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
};

const employeeSeeds: DemoEmployeeSeed[] = [
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
  },
  {
    code: 'EMP002',
    name: 'Priya Nair',
    phone: '+91 98765 43102',
    salary: 62000,
    employmentStatus: EmployeeStatus.ACTIVE,
    appActivated: true,
    selfieStatus: SelfieStatus.PENDING,
    kyc: { PAN: KycStatus.VERIFIED, AADHAR: KycStatus.PENDING },
    bankVerified: false,
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
  },
  {
    code: 'EMP007',
    name: 'Ritika Das',
    phone: '+91 98765 43107',
    salary: 39000,
    employmentStatus: EmployeeStatus.ACTIVE,
    appActivated: false,
    selfieStatus: SelfieStatus.PENDING,
    kyc: { PAN: KycStatus.PENDING },
    bankVerified: false,
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
  },
  {
    code: 'EMP011',
    name: 'Ananya Sharma',
    phone: '+91 98765 43111',
    salary: 38000,
    employmentStatus: EmployeeStatus.ACTIVE,
    appActivated: true,
    selfieStatus: SelfieStatus.VERIFIED,
    kyc: {
      PAN: KycStatus.VERIFIED,
      AADHAR: KycStatus.VERIFIED,
      SALARY_SLIP: KycStatus.VERIFIED,
    },
    bankVerified: true,
  },
  {
    code: 'EMP012',
    name: 'Rohan Mehta',
    phone: '+91 98765 43112',
    salary: 52000,
    employmentStatus: EmployeeStatus.ACTIVE,
    appActivated: true,
    selfieStatus: SelfieStatus.VERIFIED,
    kyc: {
      PAN: KycStatus.VERIFIED,
      AADHAR: KycStatus.VERIFIED,
      SALARY_SLIP: KycStatus.VERIFIED,
    },
    bankVerified: true,
  },
  {
    code: 'EMP013',
    name: 'Sneha Kulkarni',
    phone: '+91 98765 43113',
    salary: 44000,
    employmentStatus: EmployeeStatus.ACTIVE,
    appActivated: true,
    selfieStatus: SelfieStatus.VERIFIED,
    kyc: {
      PAN: KycStatus.VERIFIED,
      AADHAR: KycStatus.VERIFIED,
      SALARY_SLIP: KycStatus.VERIFIED,
    },
    bankVerified: true,
  },
];

async function seedEmployees(
  employerId: string,
  adminUserId: string,
) {
  const seeded: { id: string; employeeCode: string; salary: number }[] = [];

  for (const [index, seed] of employeeSeeds.entries()) {
    const email = `${seed.code.toLowerCase()}@northstar.mobpae.com`;
    const user = await upsertUser(email, Role.EMPLOYEE, DEMO_PASSWORD);
    const verifiedAt =
      seed.selfieStatus === SelfieStatus.VERIFIED ? addDays(-8) : null;

    const hasSelfie =
      seed.selfieStatus !== SelfieStatus.PENDING ||
      Object.keys(seed.kyc).length > 0;

    const employee = await prisma.employee.upsert({
      where: {
        employerId_employeeCode: { employerId, employeeCode: seed.code },
      },
      update: {
        userId: user.id,
        name: seed.name,
        email,
        phone: seed.phone,
        salaryInHand: seed.salary,
        appActivated: seed.appActivated,
        employmentStatus: seed.employmentStatus,
        selfieStatus: seed.selfieStatus,
        selfieVerifiedAt: verifiedAt,
        selfieVerifiedBy: verifiedAt ? adminUserId : null,
        joiningDate: addDays(-120 + index * 4),
        selfieUrl: hasSelfie
          ? `uploads/demo/${seed.code.toLowerCase()}-selfie.png`
          : null,
      },
      create: {
        userId: user.id,
        employerId,
        employeeCode: seed.code,
        name: seed.name,
        email,
        phone: seed.phone,
        salaryInHand: seed.salary,
        appActivated: seed.appActivated,
        employmentStatus: seed.employmentStatus,
        selfieStatus: seed.selfieStatus,
        selfieVerifiedAt: verifiedAt,
        selfieVerifiedBy: verifiedAt ? adminUserId : null,
        joiningDate: addDays(-120 + index * 4),
        selfieUrl: hasSelfie
          ? `uploads/demo/${seed.code.toLowerCase()}-selfie.png`
          : null,
      },
    });

    await seedEmployeeKyc(employee.id, seed.kyc, adminUserId);
    await seedBankAccount(employee.id, seed);
    await seedLoanLimit(employee.id, seed.salary);

    seeded.push({ id: employee.id, employeeCode: seed.code, salary: seed.salary });
  }

  return seeded;
}

async function seedEmployeeKyc(
  employeeId: string,
  kyc: Partial<Record<KycDocumentType, KycStatus>>,
  adminUserId: string,
) {
  for (const docType of [
    KycDocumentType.PAN,
    KycDocumentType.AADHAR,
    KycDocumentType.SALARY_SLIP,
  ]) {
    const status = kyc[docType];

    if (!status) {
      await prisma.kycDocument.deleteMany({
        where: { employeeId, documentType: docType },
      });
      continue;
    }

    await prisma.kycDocument.upsert({
      where: { employeeId_documentType: { employeeId, documentType: docType } },
      update: {
        filePath: `uploads/demo/${employeeId}-${docType.toLowerCase()}.pdf`,
        status,
        verifiedBy: status === KycStatus.VERIFIED ? adminUserId : null,
        verifiedAt: status === KycStatus.VERIFIED ? addDays(-7) : null,
      },
      create: {
        employeeId,
        documentType: docType,
        filePath: `uploads/demo/${employeeId}-${docType.toLowerCase()}.pdf`,
        status,
        verifiedBy: status === KycStatus.VERIFIED ? adminUserId : null,
        verifiedAt: status === KycStatus.VERIFIED ? addDays(-7) : null,
      },
    });
  }
}

async function seedBankAccount(employeeId: string, seed: DemoEmployeeSeed) {
  await prisma.employeeBankAccount.upsert({
    where: { employeeId },
    update: {
      accountHolderName: seed.name,
      accountNumber: `50123456${seed.code.slice(-3)}`,
      ifscCode: 'HDFC0001234',
      bankName: 'HDFC Bank',
      upiId: `${seed.code.toLowerCase()}@okhdfcbank`,
      verified: seed.bankVerified,
    },
    create: {
      employeeId,
      accountHolderName: seed.name,
      accountNumber: `50123456${seed.code.slice(-3)}`,
      ifscCode: 'HDFC0001234',
      bankName: 'HDFC Bank',
      upiId: `${seed.code.toLowerCase()}@okhdfcbank`,
      verified: seed.bankVerified,
    },
  });
}

async function seedLoanLimit(employeeId: string, salary: number) {
  await prisma.loanLimit.upsert({
    where: { employeeId },
    update: {
      maximumEligibleAmount: Math.min(salary * 0.1, 5000),
      maxRequestsPerCycle: 1,
      cooldownDays: 0,
    },
    create: {
      employeeId,
      maximumEligibleAmount: Math.min(salary * 0.1, 5000),
      maxRequestsPerCycle: 1,
      cooldownDays: 0,
    },
  });
}

// ── 11. Demo LoanApplications ────────────────────────────────────────────────
async function seedLoanApplicationWorkflows(
  employerId: string,
  seededEmployees: { id: string; employeeCode: string; salary: number }[],
  adminUserId: string,
  employerUserId: string,
  productId: string,
  configId: string,
) {
  type WorkflowItem = {
    applicationId: string;
    applicationNumber: string;
    employeeCode: string;
    requestedAmount: number;
    status: LoanApplicationStatus;
    submittedAt: Date;
    employerApprovedAt?: Date;
    adminApprovedAt?: Date;
  };

  const workflow: WorkflowItem[] = [
    {
      applicationId: 'demo-loan-app-submitted',
      applicationNumber: 'MP-SA-2026-00000001',
      employeeCode: 'EMP001',
      requestedAmount: 5000,
      status: LoanApplicationStatus.SUBMITTED,
      submittedAt: addDays(-1),
    },
    {
      applicationId: 'demo-loan-app-employer-approved',
      applicationNumber: 'MP-SA-2026-00000002',
      employeeCode: 'EMP003',
      requestedAmount: 4200,
      status: LoanApplicationStatus.AWAITING_PLATFORM_FEE_PAYMENT,
      submittedAt: addDays(-3),
      employerApprovedAt: addDays(-2),
    },
    {
      applicationId: 'demo-loan-app-ready',
      applicationNumber: 'MP-SA-2026-00000003',
      employeeCode: 'EMP005',
      requestedAmount: 5000,
      status: LoanApplicationStatus.READY_FOR_DISBURSAL,
      submittedAt: addDays(-5),
      employerApprovedAt: addDays(-4),
      adminApprovedAt: addDays(-3),
    },
    {
      applicationId: 'demo-loan-app-disbursed',
      applicationNumber: 'MP-SA-2026-00000004',
      employeeCode: 'EMP006',
      requestedAmount: 6500,
      status: LoanApplicationStatus.REPAYMENT_SCHEDULED,
      submittedAt: addDays(-10),
      employerApprovedAt: addDays(-9),
      adminApprovedAt: addDays(-8),
    },
    {
      applicationId: 'demo-loan-app-repaid',
      applicationNumber: 'MP-SA-2026-00000005',
      employeeCode: 'EMP008',
      requestedAmount: 8000,
      status: LoanApplicationStatus.REPAID,
      submittedAt: addDays(-40),
      employerApprovedAt: addDays(-39),
      adminApprovedAt: addDays(-38),
    },
  ];

  for (const item of workflow) {
    const emp = seededEmployees.find((e) => e.employeeCode === item.employeeCode);
    if (!emp) continue;

    // Snapshot values (realistic for demo)
    const payrollCutoffDate = 22;
    const payrollDate = 28;
    const submittedDay = item.submittedAt.getDate();
    // recovery = next payroll after cutoff
    const recoveryDate =
      submittedDay <= payrollCutoffDate
        ? new Date(
            item.submittedAt.getFullYear(),
            item.submittedAt.getMonth(),
            payrollDate,
          )
        : new Date(
            item.submittedAt.getFullYear(),
            item.submittedAt.getMonth() + 1,
            payrollDate,
          );
    const interestDays = Math.max(
      1,
      Math.round((recoveryDate.getTime() - item.submittedAt.getTime()) / day),
    );

    const isEmployerApproved =
      item.status !== LoanApplicationStatus.SUBMITTED &&
      item.status !== LoanApplicationStatus.EMPLOYER_REJECTED;
    const isAdminApproved =
      item.status === LoanApplicationStatus.READY_FOR_DISBURSAL ||
      item.status === LoanApplicationStatus.DISBURSED ||
      item.status === LoanApplicationStatus.REPAYMENT_SCHEDULED ||
      item.status === LoanApplicationStatus.REPAID;

    const loanApp = await prisma.loanApplication.upsert({
      where: { id: item.applicationId },
      update: {
        status: item.status,
        employerApprovedAmount: isEmployerApproved ? item.requestedAmount : null,
        adminApprovedAmount: isAdminApproved ? item.requestedAmount : null,
        employerApprovedBy: isEmployerApproved ? employerUserId : null,
        employerApprovedAt: item.employerApprovedAt ?? null,
        adminApprovedBy: isAdminApproved ? adminUserId : null,
        adminApprovedAt: item.adminApprovedAt ?? null,
        snapshotInterestDays: interestDays,
        snapshotRecoveryDate: recoveryDate,
      },
      create: {
        id: item.applicationId,
        applicationNumber: item.applicationNumber,
        employeeId: emp.id,
        employerId,
        productId,
        configId,
        requestedAmount: item.requestedAmount,
        employerApprovedAmount: isEmployerApproved ? item.requestedAmount : null,
        adminApprovedAmount: isAdminApproved ? item.requestedAmount : null,
        purposeCategory: 'EMERGENCY',
        status: item.status,
        submittedAt: item.submittedAt,
        // Snapshot
        snapshotAnnualInterestRate: 36,
        snapshotProcessingFeeRate: 0,
        snapshotGstRate: 0,
        snapshotMaxAdvancePercentage: 50,
        snapshotSalaryInHand: emp.salary,
        snapshotInterestDays: interestDays,
        snapshotRecoveryDate: recoveryDate,
        // Approval tracking
        employerApprovedBy: isEmployerApproved ? employerUserId : null,
        employerApprovedAt: item.employerApprovedAt ?? null,
        adminApprovedBy: isAdminApproved ? adminUserId : null,
        adminApprovedAt: item.adminApprovedAt ?? null,
        remarks: 'Demo loan application',
      },
    });

    // History entry
    await prisma.loanApplicationHistory.upsert({
      where: { id: `history-${item.applicationId}` },
      update: {},
      create: {
        id: `history-${item.applicationId}`,
        loanApplicationId: loanApp.id,
        previousStatus: null,
        newStatus: LoanApplicationStatus.SUBMITTED,
        changedBy: emp.id,
        actorRole: 'EMPLOYEE',
        remarks: 'Application submitted',
        createdAt: item.submittedAt,
      },
    });

    if (isEmployerApproved) {
      await seedPlatformFee(
        loanApp.id,
        emp.id,
        employerId,
        item.status === LoanApplicationStatus.AWAITING_PLATFORM_FEE_PAYMENT
          ? LoanApplicationFeeStatus.PENDING_PAYMENT
          : LoanApplicationFeeStatus.PAID,
        item.submittedAt,
      );
    }

    // Disbursal + Repayment for applicable statuses
    if (isAdminApproved && item.status !== LoanApplicationStatus.READY_FOR_DISBURSAL) {
      await seedDisbursalAndRepayment(
        loanApp.id,
        item.requestedAmount,
        interestDays,
        recoveryDate,
        item.status === LoanApplicationStatus.REPAID,
        adminUserId,
        item.submittedAt,
      );
    }
  }

  console.log(`  ✓ ${workflow.length} demo LoanApplications`);
}

async function seedPlatformFee(
  loanApplicationId: string,
  employeeId: string,
  employerId: string,
  status: LoanApplicationFeeStatus,
  submittedAt: Date,
) {
  const isPaid = status === LoanApplicationFeeStatus.PAID;
  const paidAt = isPaid ? new Date(submittedAt.getTime() + 2 * day) : null;
  const providerOrderId = isPaid
    ? `order_demo_pf_${loanApplicationId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}`
    : null;
  const providerPaymentId = isPaid
    ? `pay_demo_${loanApplicationId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 18)}`
    : null;

  const fee = await prisma.loanApplicationFee.upsert({
    where: {
      loanApplicationId_feeType: {
        loanApplicationId,
        feeType: LoanApplicationFeeType.PLATFORM_FEE,
      },
    },
    update: {
      employeeId,
      employerId,
      amount: 175,
      currency: 'INR',
      status,
      providerOrderId,
      providerPaymentId,
      paidAt,
      waivedAt: null,
      waivedBy: null,
      remarks: isPaid ? 'Demo platform fee paid through Razorpay' : null,
    },
    create: {
      loanApplicationId,
      employeeId,
      employerId,
      feeType: LoanApplicationFeeType.PLATFORM_FEE,
      amount: 175,
      currency: 'INR',
      status,
      providerOrderId,
      providerPaymentId,
      paidAt,
      remarks: isPaid ? 'Demo platform fee paid through Razorpay' : null,
    },
  });

  if (!isPaid || !providerOrderId) return;

  const order = await prisma.paymentOrder.upsert({
    where: { providerOrderId },
    update: {
      purpose: PaymentOrderPurpose.PLATFORM_FEE,
      loanApplicationFeeId: fee.id,
      employeeId,
      amount: 17500,
      currency: 'INR',
      status: PaymentOrderStatus.CAPTURED,
      expiresAt: new Date(submittedAt.getTime() + day),
      notes: { loanApplicationId, platformFeeId: fee.id },
    },
    create: {
      providerOrderId,
      purpose: PaymentOrderPurpose.PLATFORM_FEE,
      loanApplicationFeeId: fee.id,
      employeeId,
      amount: 17500,
      currency: 'INR',
      status: PaymentOrderStatus.CAPTURED,
      expiresAt: new Date(submittedAt.getTime() + day),
      notes: { loanApplicationId, platformFeeId: fee.id },
    },
  });

  await prisma.paymentEvent.upsert({
    where: { id: `event-${providerOrderId}` },
    update: {},
    create: {
      id: `event-${providerOrderId}`,
      orderId: order.id,
      providerPaymentId,
      eventType: 'payment.captured',
      source: 'SEED',
      status: 'CAPTURED',
      method: 'upi',
      capturedAt: paidAt,
      rawPayload: { seeded: true, purpose: PaymentOrderPurpose.PLATFORM_FEE },
    },
  });
}

async function seedDisbursalAndRepayment(
  loanApplicationId: string,
  amount: number,
  interestDays: number,
  dueDate: Date,
  isPaid: boolean,
  adminUserId: string,
  submittedAt: Date,
) {
  const disbursedAt = new Date(submittedAt.getTime() + 2 * day);
  const paidDate = isPaid ? new Date(dueDate.getTime() + 2 * day) : null;

  // interest = principal × (rate/365) × days  (36% p.a.)
  const principal = amount;
  const interestAmount = parseFloat(
    ((principal * 0.36 * interestDays) / 365).toFixed(2),
  );
  const totalAmount = parseFloat((principal + interestAmount).toFixed(2));

  await prisma.disbursal.upsert({
    where: { loanApplicationId },
    update: {},
    create: {
      loanApplicationId,
      requestedAmount: principal,
      approvedAmount: principal,
      disbursedAmount: principal,
      initiatedBy: adminUserId,
      disbursedBy: adminUserId,
      initiatedAt: disbursedAt,
      completedAt: disbursedAt,
      status: DisbursalStatus.SUCCESS,
      remarks: 'Demo disbursal completed',
    },
  });

  await prisma.repayment.upsert({
    where: { loanApplicationId },
    update: {},
    create: {
      loanApplicationId,
      dueDate,
      paidDate,
      status: isPaid ? RepaymentStatus.PAID : RepaymentStatus.SCHEDULED,
      principalAmount: principal,
      interestFreeAmount: 0,
      interestBearingAmount: principal,
      interestAmount,
      processingFee: 0,
      gstAmount: 0,
      totalAmount,
      interestRate: 36,
      interestDays,
      remarks: isPaid ? 'Recovered through payroll' : 'Scheduled for payroll',
    },
  });
}

// ── 12. Settlements + Notifications ─────────────────────────────────────────
async function seedSettlements(employerId: string, adminUserId: string) {
  // cycleDate = first day of that month
  const settlements = [
    {
      cycleDate: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
      settlementNumber: `MPS-DEMO-${new Date().getFullYear()}${String(new Date().getMonth()).padStart(2,'0')}-0001`,
      status: EmployerSettlementStatus.PAID,
      paidDate: addDays(-8),
      outstandingAmount: 0,
      principalAmount: 8000,
      interestAmount: 80,
    },
    {
      cycleDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      settlementNumber: `MPS-DEMO-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2,'0')}-0002`,
      status: EmployerSettlementStatus.GENERATED,
      paidDate: null,
      outstandingAmount: 6550,
      principalAmount: 6500,
      interestAmount: 50,
    },
  ];

  for (const s of settlements) {
    const totalAmount = s.principalAmount + s.interestAmount;
    const record = await prisma.employerSettlement.upsert({
      where: {
        employerId_cycleDate: { employerId, cycleDate: s.cycleDate },
      },
      update: {
        principalAmount: s.principalAmount,
        interestAmount: s.interestAmount,
        lateFeeAmount: 0,
        totalAmount,
        outstandingAmount: s.outstandingAmount,
        dueDate: s.status === EmployerSettlementStatus.PAID ? addDays(-12) : addDays(10),
        paidDate: s.paidDate,
        status: s.status,
      },
      create: {
        employerId,
        settlementNumber: s.settlementNumber,
        cycleDate: s.cycleDate,
        principalAmount: s.principalAmount,
        interestAmount: s.interestAmount,
        processingFeeAmount: 0,
        gstAmount: 0,
        lateFeeAmount: 0,
        totalAmount,
        outstandingAmount: s.outstandingAmount,
        employeeCount: 1,
        dueDate: s.status === EmployerSettlementStatus.PAID ? addDays(-12) : addDays(10),
        paidDate: s.paidDate,
        status: s.status,
        generatedAt: new Date(),
        generatedBy: adminUserId,
        notes: 'Demo settlement generated by seed',
      },
    });

    await upsertAuditLog(
      `demo-audit-settlement-${s.settlementNumber}`,
      adminUserId,
      {
        action:
          s.status === EmployerSettlementStatus.PAID
            ? 'SETTLEMENT_PAID'
            : 'SETTLEMENT_GENERATED',
        entityType: 'SETTLEMENT',
        entityId: record.id,
        newValue: {
          settlementNumber: record.settlementNumber,
          status: record.status,
          outstandingAmount: Number(record.outstandingAmount),
        },
      },
    );
  }

  console.log(`  ✓ ${settlements.length} demo EmployerSettlements`);
}

async function seedNotifications(adminUserId: string, employerUserId: string) {
  const notifications = [
    {
      id: 'demo-notif-admin-kyc',
      userId: adminUserId,
      title: 'KYC review queue',
      message: 'Three demo employees have pending or rejected KYC documents.',
    },
    {
      id: 'demo-notif-admin-disbursal',
      userId: adminUserId,
      title: 'Disbursal ready',
      message: 'One loan application is ready for admin disbursal.',
    },
    {
      id: 'demo-notif-employer-request',
      userId: employerUserId,
      title: 'Loan application pending',
      message: 'Arjun Sharma submitted a salary advance request.',
    },
  ];

  for (const n of notifications) {
    await prisma.notification.upsert({
      where: { id: n.id },
      update: {},
      create: { ...n, type: NotificationType.SYSTEM, isRead: false },
    });
  }

  console.log(`  ✓ ${notifications.length} demo Notifications`);
}

// ── App Information ──────────────────────────────────────────────────────────
async function seedAppInformation() {
  const entries = [
    {
      type: 'ABOUT' as const,
      title: 'About MobPae',
      version: '2.0.0',
      content: `MobPae is a salary advance platform that empowers employees to access a portion of their earned salary before payday — instantly, securely, and without hidden charges.\n\nWe partner with employers to offer this benefit as part of their employee wellness programme.`,
    },
    {
      type: 'PRIVACY_POLICY' as const,
      title: 'Privacy Policy',
      version: '1.0.0',
      content: `Last updated: July 2026\n\nMobPae collects only the information necessary to process salary advances: name, email, phone, KYC documents, bank account details, and device/usage data. Data is encrypted in transit and at rest. We never sell personal data. Contact support@mobpae.com for privacy queries.`,
    },
    {
      type: 'TERMS_CONDITIONS' as const,
      title: 'Terms & Conditions',
      version: '1.0.0',
      content: `Last updated: July 2026\n\nBy using MobPae you agree to these Terms. Salary advances are limited to your employer-approved percentage of salary. Repayment is deducted automatically from your next payroll. A request-specific platform fee may be payable after employer approval and before MobPae review/disbursal.`,
    },
    {
      type: 'HOW_IT_WORKS' as const,
      title: 'How It Works',
      version: '1.0.0',
      content: `1. Sign Up — Log in with credentials sent by your employer.\n2. Complete KYC — Upload Aadhaar, PAN, salary slip.\n3. Add Bank Account — Link where you want the advance credited.\n4. Request Advance — Submit the amount needed.\n5. Employer Approval — Your employer verifies the request.\n6. Pay Platform Fee — Pay the request-specific fee only after employer approval.\n7. Receive Money — Advance is credited after MobPae review.\n8. Auto-Repayment — Deducted from your next salary.`,
    },
    {
      type: 'FAQ' as const,
      title: 'FAQ',
      version: '1.0.0',
      content: `Q: How much can I borrow?\nA: Up to 50% of your monthly salary (subject to your employer's policy and MobPae limit).\n\nQ: What are the charges?\nA: Simple interest at 36% p.a., calculated daily from request date to payroll date. No processing fees.\n\nQ: How fast is disbursal?\nA: Typically within 1–3 business days after admin approval.\n\nQ: Can I have multiple advances?\nA: Only one active advance at a time. Apply again after full repayment.`,
    },
    {
      type: 'CONTACT' as const,
      title: 'Contact & Support',
      version: '1.0.0',
      content: `Email: support@mobpae.com\nBusiness hours: Mon–Fri 9AM–6PM IST\nWebsite: https://mobpae.com`,
    },
    {
      type: 'WHATS_NEW' as const,
      title: "What's New",
      version: '2.0.0',
      content: `Version 2.0.0 — July 2026\n- Rebuilt lending engine as a product-based platform\n- Versioned product configuration\n- Improved eligibility and pricing engine\n- Human-readable application numbers (MP-SA-2026-XXXXXXXX)\n- Detailed repayment breakdown`,
    },
  ];

  for (const entry of entries) {
    await (prisma.appInformation as any).upsert({
      where: { type: entry.type },
      update: { title: entry.title, content: entry.content, version: entry.version },
      create: { ...entry, isActive: true },
    });
  }

  console.log(`  ✓ ${entries.length} AppInformation rows`);
}

// ── Audit log helper ─────────────────────────────────────────────────────────
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
  const payload: {
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

  if (data.oldValue) payload.oldValue = data.oldValue as Prisma.InputJsonObject;
  if (data.newValue) payload.newValue = data.newValue as Prisma.InputJsonObject;

  await prisma.auditLog.upsert({
    where: { id },
    update: payload,
    create: { id, ...payload },
  });
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Seeding MobPae v3.1...');

  // 1. Admin
  const admin = await upsertUser(ADMIN_EMAIL, Role.ADMIN, ADMIN_PASSWORD);
  console.log(`  ✓ Admin user: ${ADMIN_EMAIL}`);

  // 2. Settings
  await seedSettings();

  // 3. AppInformation
  await seedAppInformation();

  // 4+5. LoanProduct + config
  const saProduct = await seedLendingCatalog();

  // 6. Sequence
  await seedSequence();

  // 7. Employer
  const employer = await seedEmployer(admin.id);
  const employerUser = await prisma.user.findUniqueOrThrow({
    where: { email: EMPLOYER_EMAIL },
  });
  console.log(`  ✓ Employer: ${employer.companyName}`);

  // 8. EmployerProductConfig
  await seedEmployerProductConfig(employer.id, saProduct.id);

  // 9. Employees
  const seededEmployees = await seedEmployees(employer.id, admin.id);
  console.log(`  ✓ ${seededEmployees.length} demo employees`);

  // 10. Loan applications
  const activeConfig = await prisma.loanProductConfig.findFirstOrThrow({
    where: { productId: saProduct.id, isActive: true },
  });
  await seedLoanApplicationWorkflows(
    employer.id,
    seededEmployees,
    admin.id,
    employerUser.id,
    saProduct.id,
    activeConfig.id,
  );

  // 12. Settlements + Notifications
  await seedSettlements(employer.id, admin.id);
  await seedNotifications(admin.id, employerUser.id);

  console.log('\n🌱 Seed complete.');
  console.log(`   Admin:    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`   Employer: ${EMPLOYER_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`   Employees: emp001@northstar.mobpae.com – emp010@ / ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
