import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LoanApplicationStatus } from '@prisma/client';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { EligibilityService } from '../eligibility/eligibility.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  EligibilityRules,
  PricingRules,
} from '../loan-products/dto/create-loan-product-config.dto';
import { paginate } from '../common/utils/pagination.util';

import { BulkLoanApplicationActionDto } from './dto/bulk-loan-application-action.dto';
import { CreateLoanApplicationDto } from './dto/create-loan-application.dto';
import { LoanApplicationListQueryDto } from './dto/loan-application-list-query.dto';
import { RejectLoanApplicationDto } from './dto/reject-loan-application.dto';

// Statuses that block a new submission
const ACTIVE_STATUSES: LoanApplicationStatus[] = [
  'SUBMITTED',
  'EMPLOYER_APPROVED',
  'AWAITING_MEMBERSHIP_PAYMENT',
  'READY_FOR_DISBURSAL',
  'DISBURSED',
  'REPAYMENT_SCHEDULED',
];

// Full relation include used for detail views
const DETAIL_INCLUDE = {
  employee: { select: { id: true, name: true, email: true, employeeCode: true, profilePhotoUrl: true } },
  employer: { select: { id: true, companyName: true } },
  config: { select: { versionNumber: true, versionName: true } },
  history: { orderBy: { createdAt: 'asc' as const } },
  disbursal: true,
  repayment: true,
} as const;

@Injectable()
export class LoanApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly eligibilityService: EligibilityService,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ── Employee: preview repayment for a given amount ─────────────────────────

  async preview(userId: string, amount: number) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      include: {
        employer: { select: { payrollDate: true, payrollCutoffDate: true } },
      },
    });
    if (!employee?.employer) throw new NotFoundException('Employee not found');

    const config = await this.getActiveConfig();
    const employerConfig = await this.prisma.employerProductConfig.findUnique({
      where: { employerId_productId: { employerId: employee.employerId, productId: config.productId } },
    });

    const pricing = config.pricingRules as unknown as PricingRules;
    const eligibility = config.eligibilityRules as unknown as EligibilityRules;
    const maxAdvancePercentage = employerConfig?.maximumAdvancePercentageOverride
      ? Number(employerConfig.maximumAdvancePercentageOverride)
      : eligibility.maximumAdvancePercentage;

    const snapshot = this.pricingService.computeSnapshot({
      salaryInHand: Number(employee.salaryInHand),
      annualInterestRate: pricing.annualInterestRate,
      interestFreePercentage: pricing.interestFreePercentage,
      processingFeeRate: pricing.processingFeeRate,
      gstRate: pricing.gstRate,
      maxAdvancePercentage,
      submissionDate: new Date(),
      payrollDate: employee.employer.payrollDate,
      payrollCutoffDate: employee.employer.payrollCutoffDate,
    });

    const breakdown = this.pricingService.computeRepaymentBreakdown(amount, snapshot);

    return {
      requestedAmount: amount,
      annualInterestRate: snapshot.snapshotAnnualInterestRate,
      interestDays: snapshot.snapshotInterestDays,
      recoveryDate: snapshot.snapshotRecoveryDate,
      ...breakdown,
    };
  }

  // ── Employee: eligibility check ─────────────────────────────────────────────

  async getEligibility(userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new NotFoundException('Employee not found');
    return this.eligibilityService.check(employee.id);
  }

  // ── Employee: submit application ────────────────────────────────────────────

  async create(userId: string, dto: CreateLoanApplicationDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      include: {
        employer: { select: { id: true, userId: true, payrollDate: true, payrollCutoffDate: true } },
      },
    });
    if (!employee?.employer) throw new NotFoundException('Employee or employer not found');

    // 1. Eligibility
    const eligibility = await this.eligibilityService.check(employee.id, dto.amount);
    if (!eligibility.eligible) {
      throw new BadRequestException(eligibility.reason ?? 'Not eligible for a loan application');
    }

    // 2. Active product config
    const config = await this.getActiveConfig();
    const employerConfig = await this.prisma.employerProductConfig.findUnique({
      where: { employerId_productId: { employerId: employee.employerId, productId: config.productId } },
    });

    // 3. Pricing inputs
    const pricing = config.pricingRules as unknown as PricingRules;
    const rules = config.eligibilityRules as unknown as EligibilityRules;
    const maxAdvancePercentage = employerConfig?.maximumAdvancePercentageOverride
      ? Number(employerConfig.maximumAdvancePercentageOverride)
      : rules.maximumAdvancePercentage;

    // 4. Freeze snapshot
    const submissionDate = new Date();
    const snapshot = this.pricingService.computeSnapshot({
      salaryInHand: Number(employee.salaryInHand),
      annualInterestRate: pricing.annualInterestRate,
      interestFreePercentage: pricing.interestFreePercentage,
      processingFeeRate: pricing.processingFeeRate,
      gstRate: pricing.gstRate,
      maxAdvancePercentage,
      submissionDate,
      payrollDate: employee.employer.payrollDate,
      payrollCutoffDate: employee.employer.payrollCutoffDate,
    });

    // 5. Application number from PostgreSQL sequence
    const productType = await this.getProductType(config.productId);
    const applicationNumber = await this.generateApplicationNumber(productType);

    // 6. Persist
    const application = await this.prisma.loanApplication.create({
      data: {
        applicationNumber,
        employeeId: employee.id,
        employerId: employee.employerId,
        productId: config.productId,
        configId: config.id,
        status: 'SUBMITTED',
        requestedAmount: dto.amount,
        purposeCategory: dto.purposeCategory,
        purposeNote: dto.purposeNote ?? null,
        remarks: dto.remarks ?? null,
        submittedAt: submissionDate,
        // Snapshot — frozen forever
        snapshotAnnualInterestRate: snapshot.snapshotAnnualInterestRate,
        snapshotInterestFreePercentage: snapshot.snapshotInterestFreePercentage,
        snapshotProcessingFeeRate: snapshot.snapshotProcessingFeeRate,
        snapshotGstRate: snapshot.snapshotGstRate,
        snapshotMaxAdvancePercentage: snapshot.snapshotMaxAdvancePercentage,
        snapshotSalaryInHand: snapshot.snapshotSalaryInHand,
        snapshotInterestDays: snapshot.snapshotInterestDays,
        snapshotRecoveryDate: snapshot.snapshotRecoveryDate,
        history: {
          create: {
            previousStatus: null,
            newStatus: 'SUBMITTED',
            changedBy: userId,
            actorRole: 'EMPLOYEE',
            remarks: 'Application submitted by employee',
          },
        },
      },
      include: DETAIL_INCLUDE,
    });

    // 7. Notify employer
    if (employee.employer.userId) {
      this.notificationsService
        .createSystemNotification(
          employee.employer.userId,
          'New Loan Application',
          `${employee.name} has submitted a loan application of ₹${dto.amount}.`,
        )
        .catch(() => {});
    }

    await this.auditLogsService.log({
      userId,
      action: 'LOAN_APPLICATION_SUBMITTED',
      entityType: 'LOAN_APPLICATION',
      entityId: application.id,
      newValue: { applicationNumber, requestedAmount: dto.amount, status: 'SUBMITTED' },
    });

    return application;
  }

  // ── Employee: view own applications ────────────────────────────────────────

  async findByUserId(userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.prisma.loanApplication.findMany({
      where: { employeeId: employee.id },
      include: {
        repayment: { select: { status: true, totalAmount: true, dueDate: true } },
        disbursal: { select: { status: true, disbursedAmount: true, disbursedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Employee: view one own application ─────────────────────────────────────

  async findMyOne(id: string, userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const app = await this.prisma.loanApplication.findFirst({
      where: { id, employeeId: employee.id },
      include: DETAIL_INCLUDE,
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  // ── Employee: cancel ────────────────────────────────────────────────────────

  async cancel(id: string, userId: string, remarks?: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const app = await this.prisma.loanApplication.findFirst({
      where: { id, employeeId: employee.id },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status !== 'SUBMITTED') {
      throw new BadRequestException('Only SUBMITTED applications can be cancelled');
    }

    return this.prisma.loanApplication.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        history: {
          create: {
            previousStatus: 'SUBMITTED',
            newStatus: 'CANCELLED',
            changedBy: userId,
            actorRole: 'EMPLOYEE',
            remarks: remarks ?? 'Cancelled by employee',
          },
        },
      },
    });
  }

  // ── Employer: view company applications ─────────────────────────────────────

  async findAllForEmployer(userId: string) {
    const employer = await this.prisma.employer.findUnique({ where: { userId } });
    if (!employer) throw new NotFoundException('Employer not found');

    return this.prisma.loanApplication.findMany({
      where: { employerId: employer.id },
      include: {
        employee: { select: { id: true, name: true, employeeCode: true } },
        repayment: { select: { status: true, totalAmount: true, dueDate: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async findPendingByEmployer(userId: string) {
    const employer = await this.prisma.employer.findUnique({ where: { userId } });
    if (!employer) throw new NotFoundException('Employer not found');

    return this.prisma.loanApplication.findMany({
      where: { employerId: employer.id, status: 'SUBMITTED' },
      include: {
        employee: { select: { id: true, name: true, employeeCode: true, salaryInHand: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });
  }

  // ── Employer: approve ───────────────────────────────────────────────────────

  async employerApprove(id: string, actorUserId: string) {
    const employer = await this.prisma.employer.findUnique({ where: { userId: actorUserId } });
    if (!employer) throw new ForbiddenException('Not an employer');

    const app = await this.prisma.loanApplication.findFirst({
      where: { id, employerId: employer.id },
      include: { employee: { include: { membership: true } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status !== 'SUBMITTED') {
      throw new BadRequestException('Only SUBMITTED applications can be employer-approved');
    }

    const membershipActive = app.employee.membership?.status === 'ACTIVE';
    const newStatus: LoanApplicationStatus = membershipActive
      ? 'EMPLOYER_APPROVED'
      : 'AWAITING_MEMBERSHIP_PAYMENT';

    const updated = await this.prisma.loanApplication.update({
      where: { id },
      data: {
        status: newStatus,
        employerApprovedAmount: app.requestedAmount,
        employerApprovedBy: actorUserId,
        employerApprovedAt: new Date(),
        history: {
          create: {
            previousStatus: 'SUBMITTED',
            newStatus,
            changedBy: actorUserId,
            actorRole: 'EMPLOYER',
            remarks: membershipActive
              ? 'Employer approved'
              : 'Employer approved; awaiting membership payment',
          },
        },
      },
    });

    if (app.employee.userId) {
      const msg = membershipActive
        ? 'Your loan application has been approved by your employer.'
        : 'Your loan application is approved. Please complete your membership payment to proceed.';
      this.notificationsService
        .createSystemNotification(app.employee.userId, 'Loan Application Approved', msg)
        .catch(() => {});
    }

    return updated;
  }

  // ── Employer: reject ────────────────────────────────────────────────────────

  async employerReject(id: string, dto: RejectLoanApplicationDto, actorUserId: string) {
    const employer = await this.prisma.employer.findUnique({ where: { userId: actorUserId } });
    if (!employer) throw new ForbiddenException('Not an employer');

    const app = await this.prisma.loanApplication.findFirst({
      where: { id, employerId: employer.id },
      include: { employee: true },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status !== 'SUBMITTED') {
      throw new BadRequestException('Only SUBMITTED applications can be employer-rejected');
    }

    const updated = await this.prisma.loanApplication.update({
      where: { id },
      data: {
        status: 'EMPLOYER_REJECTED',
        rejectedBy: actorUserId,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
        history: {
          create: {
            previousStatus: 'SUBMITTED',
            newStatus: 'EMPLOYER_REJECTED',
            changedBy: actorUserId,
            actorRole: 'EMPLOYER',
            remarks: dto.reason,
          },
        },
      },
    });

    if (app.employee.userId) {
      this.notificationsService
        .createSystemNotification(
          app.employee.userId,
          'Loan Application Rejected',
          `Your loan application has been rejected. Reason: ${dto.reason}`,
        )
        .catch(() => {});
    }

    return updated;
  }

  // ── Employer: bulk action ───────────────────────────────────────────────────

  async bulkAction(dto: BulkLoanApplicationActionDto, actorUserId: string) {
    const results = await Promise.allSettled(
      dto.ids.map((id) =>
        dto.action === 'APPROVE'
          ? this.employerApprove(id, actorUserId)
          : this.employerReject(id, { reason: dto.reason ?? 'Bulk rejected' }, actorUserId),
      ),
    );

    const succeeded: string[] = [];
    const failed: { id: string; message: string }[] = [];

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        succeeded.push(dto.ids[i]);
      } else {
        failed.push({ id: dto.ids[i], message: (result.reason as Error)?.message ?? 'Unknown error' });
      }
    });

    return { action: dto.action, processed: dto.ids.length, succeeded, failed };
  }

  // ── Admin: list all ─────────────────────────────────────────────────────────

  async findAllForAdmin(query: LoanApplicationListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.employerId) where.employerId = query.employerId;
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.startDate || query.endDate) {
      where.submittedAt = {};
      if (query.startDate) where.submittedAt.gte = new Date(query.startDate);
      if (query.endDate) where.submittedAt.lte = new Date(query.endDate);
    }
    if (query.search) {
      where.OR = [
        { applicationNumber: { contains: query.search, mode: 'insensitive' } },
        { employee: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.loanApplication.findMany({
        where,
        include: {
          employee: { select: { id: true, name: true, employeeCode: true } },
          employer: { select: { id: true, companyName: true } },
          disbursal: { select: { status: true, disbursedAmount: true } },
          repayment: { select: { status: true, totalAmount: true, dueDate: true } },
        },
        orderBy: { [query.sortBy ?? 'submittedAt']: query.sortOrder ?? 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.loanApplication.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  // ── Admin/Employer: find by employee ────────────────────────────────────────

  async findByEmployee(employeeId: string) {
    return this.prisma.loanApplication.findMany({
      where: { employeeId },
      include: {
        disbursal: { select: { status: true, disbursedAmount: true } },
        repayment: { select: { status: true, totalAmount: true, dueDate: true } },
        history: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  // ── Admin/Employer: detail ──────────────────────────────────────────────────

  async findOne(id: string, user: { userId: string; role: string }) {
    const app = await this.prisma.loanApplication.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!app) throw new NotFoundException('Application not found');

    // Employer can only see their own company's applications
    if (user.role === 'EMPLOYER') {
      const employer = await this.prisma.employer.findUnique({ where: { userId: user.userId } });
      if (!employer || employer.id !== app.employerId) {
        throw new ForbiddenException('Access denied');
      }
    }

    return app;
  }

  // ── Admin: approve ──────────────────────────────────────────────────────────

  async adminApprove(id: string, actorUserId: string) {
    const app = await this.prisma.loanApplication.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status !== 'EMPLOYER_APPROVED') {
      throw new BadRequestException(
        `Only EMPLOYER_APPROVED applications can be admin-approved (current: ${app.status})`,
      );
    }

    const updated = await this.prisma.loanApplication.update({
      where: { id },
      data: {
        status: 'READY_FOR_DISBURSAL',
        adminApprovedAmount: app.employerApprovedAmount ?? app.requestedAmount,
        adminApprovedBy: actorUserId,
        adminApprovedAt: new Date(),
        history: {
          create: {
            previousStatus: 'EMPLOYER_APPROVED',
            newStatus: 'READY_FOR_DISBURSAL',
            changedBy: actorUserId,
            actorRole: 'ADMIN',
            remarks: 'Admin approved; ready for disbursal',
          },
        },
      },
    });

    if (app.employee.userId) {
      this.notificationsService
        .createSystemNotification(
          app.employee.userId,
          'Loan Application Ready for Disbursal',
          'Your loan application has been approved and is ready for disbursal.',
        )
        .catch(() => {});
    }

    return updated;
  }

  // ── Admin: reject ───────────────────────────────────────────────────────────

  async adminReject(id: string, dto: RejectLoanApplicationDto, actorUserId: string) {
    const app = await this.prisma.loanApplication.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    const rejectableStatuses: LoanApplicationStatus[] = [
      'SUBMITTED',
      'EMPLOYER_APPROVED',
      'AWAITING_MEMBERSHIP_PAYMENT',
      'READY_FOR_DISBURSAL',
    ];
    if (!rejectableStatuses.includes(app.status)) {
      throw new BadRequestException(`Cannot reject application in status: ${app.status}`);
    }

    const updated = await this.prisma.loanApplication.update({
      where: { id },
      data: {
        status: 'ADMIN_REJECTED',
        rejectedBy: actorUserId,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
        history: {
          create: {
            previousStatus: app.status,
            newStatus: 'ADMIN_REJECTED',
            changedBy: actorUserId,
            actorRole: 'ADMIN',
            remarks: dto.reason,
          },
        },
      },
    });

    if (app.employee.userId) {
      this.notificationsService
        .createSystemNotification(
          app.employee.userId,
          'Loan Application Rejected',
          `Your loan application has been rejected by admin. Reason: ${dto.reason}`,
        )
        .catch(() => {});
    }

    return updated;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async getActiveConfig() {
    const config = await this.prisma.loanProductConfig.findFirst({
      where: { product: { productType: 'SA' }, isActive: true },
    });
    if (!config) {
      throw new ServiceUnavailableException(
        'No active Salary Advance product configuration found. Contact admin.',
      );
    }
    return config;
  }

  private async getProductType(productId: string): Promise<string> {
    const product = await this.prisma.loanProduct.findUnique({
      where: { id: productId },
      select: { productType: true },
    });
    return product?.productType ?? 'SA';
  }

  private async generateApplicationNumber(productType: string): Promise<string> {
    const result = await this.prisma.$queryRaw<[{ nextval: bigint }]>`
      SELECT nextval('loan_application_seq')
    `;
    const seq = Number(result[0].nextval);
    const year = new Date().getFullYear();
    return `MP-${productType}-${year}-${String(seq).padStart(8, '0')}`;
  }
}
