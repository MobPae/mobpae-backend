import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FilesService } from '../files/files.service';
import { UploadType } from '../files/upload-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { PushNotificationService } from '../notifications/push-notification.service';
import { EmailService } from '../email/email.service';
import {
  containsSearch,
  getOrderBy,
  getPagination,
  hasSearch,
  paginate,
} from '../common/utils/pagination.util';
import { EmployeeListQueryDto } from './dto/employee-list-query.dto';
import { REQUIRED_KYC_DOCUMENTS } from '../common/constants/kyc.constants';
import { PlatformFeesService } from '../platform-fees/platform-fees.service';
import { normalizeEmail } from '../common/utils/email.util';

// App-state responses need display-only platform-fee status. Razorpay order IDs
// are returned only by the explicit payment-initiation endpoint.
const APP_STATE_PLATFORM_FEE_SELECT = {
  id: true,
  amount: true,
  currency: true,
  status: true,
  paidAt: true,
  paymentOrders: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      createdAt: true,
      expiresAt: true,
    },
  },
} as const;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly filesService: FilesService,
    private readonly notificationsService: NotificationsService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly emailService: EmailService,
    private readonly platformFeesService: PlatformFeesService,
  ) {}

  async create(dto: CreateEmployeeDto, employerId: string, actorUserId: string) {
    const normalizedDto = {
      ...dto,
      email: normalizeEmail(dto.email),
    };

    const employer = await this.prisma.employer.findUnique({
      where: {
        id: employerId,
      },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: normalizedDto.email,
      },
    });

    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    const existingEmployeeCode = await this.prisma.employee.findFirst({
      where: {
        employerId: employer.id,
        employeeCode: dto.employeeCode,
      },
      select: {
        id: true,
      },
    });

    if (existingEmployeeCode) {
      throw new ConflictException(
        'Employee code already exists for this employer',
      );
    }

    const temporaryPassword = this.generateTemporaryPassword();

    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    const employee = await this.createEmployeeInTransaction(
      normalizedDto,
      actorUserId,
      employer.id,
      hashedPassword,
    );

    this.logTemporaryEmployeePassword({
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      email: normalizedDto.email,
      password: temporaryPassword,
    });

    await this.sendEmployeeCreatedEmail(
      normalizedDto.email,
      normalizedDto.name,
      employer.companyName,
      temporaryPassword,
    );

    return {
      employee,
    };
  }

  private async createEmployeeInTransaction(
    dto: CreateEmployeeDto,
    actorUserId: string,
    employerId: string,
    hashedPassword: string,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const employmentStatus = dto.employmentStatus ?? 'ACTIVE';
        // Inactive employees should never receive app access at creation time.
        const appActivated =
          employmentStatus === 'INACTIVE' ? false : (dto.appActivated ?? false);

        const user = await tx.user.create({
          data: {
            email: dto.email,
            password: hashedPassword,
            role: 'EMPLOYEE',
            isActive: true,
            passwordChanged: false,
          },
        });

        const employee = await tx.employee.create({
          data: {
            userId: user.id,
            employerId,
            employeeCode: dto.employeeCode,
            name: dto.name,
            email: dto.email,
            phone: dto.phone,
            salaryInHand: dto.salaryInHand,
            employmentStatus,
            appActivated,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: actorUserId,
            action: 'EMPLOYEE_CREATED',
            entityType: 'EMPLOYEE',
            entityId: employee.id,
            newValue: {
              employerId: employee.employerId,
              employeeCode: employee.employeeCode,
              name: employee.name,
              email: employee.email,
              employmentStatus: employee.employmentStatus,
              appActivated: employee.appActivated,
            },
          },
        });

        return employee;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = Array.isArray(error.meta?.target)
          ? error.meta.target
          : [];

        if (target.includes('employerId') && target.includes('employeeCode')) {
          throw new ConflictException(
            'Employee code already exists for this employer',
          );
        }

        if (target.includes('email')) {
          throw new ConflictException('User already exists');
        }
      }

      throw error;
    }
  }

  async findAll(query: EmployeeListQueryDto = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const where: any = {
      employerId: query.employerId,
      employmentStatus: query.employmentStatus,
      ...(hasSearch(query)
        ? {
            OR: [
              { employeeCode: containsSearch(query) },
              { name: containsSearch(query) },
              { email: containsSearch(query) },
              { phone: containsSearch(query) },
              {
                employer: {
                  companyName: containsSearch(query),
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        include: {
          employer: true,
          user: { select: { passwordChanged: true } },
        },
        orderBy: getOrderBy(
          query,
          [
            'employeeCode',
            'name',
            'email',
            'salaryInHand',
            'employmentStatus',
            'createdAt',
          ],
          'createdAt',
        ),
        skip,
        take,
      }),
      this.prisma.employee.count({
        where,
      }),
    ]);

    return paginate(data, total, page, limit);
  }

  async update(employeeId: string, dto: UpdateEmployeeDto, employerId: string, actorUserId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        id: employerId,
      },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        employerId: employer.id,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const updatedEmployee = await this.prisma.employee.update({
      where: {
        id: employeeId,
      },
      data: {
        ...dto,
        ...(dto.employmentStatus === 'INACTIVE'
          ? {
              appActivated: false,
            }
          : {}),
      },
    });

    await this.writeAuditLog({
      userId: actorUserId,
      action: 'EMPLOYEE_UPDATED',
      entityType: 'EMPLOYEE',
      entityId: updatedEmployee.id,
      oldValue: this.employeeAuditValue(employee),
      newValue: this.employeeAuditValue(updatedEmployee),
    });

    return updatedEmployee;
  }

  async updateActivation(
    employeeId: string,
    appActivated: boolean,
    employerId: string,
    actorUserId: string,
  ) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        id: employerId,
      },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        employerId: employer.id,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const updatedEmployee = await this.prisma.employee.update({
      where: {
        id: employeeId,
      },
      data: {
        appActivated,
      },
    });

    await this.writeAuditLog({
      userId: actorUserId,
      action: 'EMPLOYEE_UPDATED',
      entityType: 'EMPLOYEE',
      entityId: updatedEmployee.id,
      oldValue: this.employeeAuditValue(employee),
      newValue: this.employeeAuditValue(updatedEmployee),
    });

    return updatedEmployee;
  }

  async bulkActivation(
    employeeIds: string[],
    appActivated: boolean,
    employerId: string,
    actorUserId: string,
  ) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        id: employerId,
      },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    const result = await this.prisma.employee.updateMany({
      where: {
        id: {
          in: employeeIds,
        },
        employerId: employer.id,
      },
      data: {
        appActivated,
      },
    });

    await this.writeAuditLog({
      userId: actorUserId,
      action: 'EMPLOYEE_UPDATED',
      entityType: 'EMPLOYEE',
      entityId: employer.id,
      oldValue: null,
      newValue: {
        employeeIds,
        appActivated,
        updatedCount: result.count,
      },
    });

    return {
      updatedCount: result.count,
    };
  }

  async getKycStatus(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        id: employeeId,
      },
      select: {
        id: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const documents = await this.prisma.kycDocument.findMany({
      where: {
        employeeId,
        status: 'VERIFIED',
      },
    });

    const pan = documents.some((doc) => doc.documentType === 'PAN');

    const aadhar = documents.some((doc) => doc.documentType === 'AADHAR');

    const salarySlip = documents.some(
      (doc) => doc.documentType === 'SALARY_SLIP',
    );

    return {
      pan,
      aadhar,
      salarySlip,
      kycCompleted: pan && aadhar && salarySlip,
    };
  }

  // Bulk Create employees with row-level error handling. Temporary passwords are
  // delivered through email and development console logs only, never API payloads.
  async bulkCreate(employerId: string, employees: CreateEmployeeDto[], actorUserId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        id: employerId,
      },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    const created: {
      employeeCode: string;
      name: string;
      email: string;
    }[] = [];

    const errors: {
      row: number;
      employeeCode: string;
      email: string;
      message: string;
    }[] = [];

    for (let index = 0; index < employees.length; index++) {
      const employee = {
        ...employees[index],
        email: normalizeEmail(employees[index].email),
      };

      try {
        const salaryInHand = Number(employee.salaryInHand);

        if (!Number.isFinite(salaryInHand) || salaryInHand <= 0) {
          errors.push({
            row: index + 1,
            employeeCode: employee.employeeCode,
            email: employee.email,
            message: 'Salary in hand must be greater than zero',
          });

          continue;
        }

        const existingEmployeeCode = await this.prisma.employee.findFirst({
          where: {
            employerId: employer.id,
            employeeCode: employee.employeeCode,
          },
        });

        if (existingEmployeeCode) {
          errors.push({
            row: index + 1,
            employeeCode: employee.employeeCode,
            email: employee.email,
            message: 'Employee code already exists',
          });

          continue;
        }

        const existingUser = await this.prisma.user.findUnique({
          where: {
            email: employee.email,
          },
        });

        if (existingUser) {
          errors.push({
            row: index + 1,
            employeeCode: employee.employeeCode,
            email: employee.email,
            message: 'User already exists',
          });

          continue;
        }

        const temporaryPassword = this.generateTemporaryPassword();
        const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

        const createdEmployee = await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email: employee.email,
              password: hashedPassword,
              role: 'EMPLOYEE',
              isActive: true,
              passwordChanged: false,
            },
          });

          const createdEmployee = await tx.employee.create({
            data: {
              userId: user.id,
              employerId: employer.id,

              employeeCode: employee.employeeCode,
              name: employee.name,
              email: employee.email,
              phone: employee.phone,

              salaryInHand,

              employmentStatus: 'ACTIVE',
              appActivated: false,
            },
          });

          await tx.auditLog.create({
            data: {
              userId: actorUserId,
              action: 'EMPLOYEE_CREATED',
              entityType: 'EMPLOYEE',
              entityId: createdEmployee.id,
              newValue: {
                employerId: createdEmployee.employerId,
                employeeCode: createdEmployee.employeeCode,
                name: createdEmployee.name,
                email: createdEmployee.email,
                employmentStatus: createdEmployee.employmentStatus,
                appActivated: createdEmployee.appActivated,
              },
            },
          });

          return createdEmployee;
        });

        created.push({
          employeeCode: employee.employeeCode,
          name: employee.name,
          email: employee.email,
        });

        this.logTemporaryEmployeePassword({
          employeeId: createdEmployee.id,
          employeeCode: createdEmployee.employeeCode,
          email: employee.email,
          password: temporaryPassword,
        });

        await this.sendEmployeeCreatedEmail(
          employee.email,
          employee.name,
          employer.companyName,
          temporaryPassword,
        );
      } catch (error) {
        errors.push({
          row: index + 1,
          employeeCode: employee.employeeCode,
          email: employee.email,
          message: 'Failed to create employee',
        });
      }
    }

    return {
      successCount: created.length,
      failureCount: errors.length,
      created,
      errors,
    };
  }

  /**
   * Employee Mobile App Profile
   *
   * Powers:
   * - Home Dashboard
   * - Profile Screen
   * - Advance Eligibility
   * - KYC Status
   * - Bank Account Status
   */
  async findByUserId(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
      include: {
        employer: true,
        loanLimit: true,
        bankAccount: true,
        kycDocuments: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    /**
     * Loan Limit — set by admin when onboarding the employee.
     * Available advance = maximumEligibleAmount − active outstanding requests.
     */
    const maximumEligibleAmount = employee.loanLimit
      ? Number(employee.loanLimit.maximumEligibleAmount)
      : 0;

    const activeRequests = await this.prisma.loanApplication.findMany({
      where: {
        employeeId: employee.id,
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
      },
      select: {
        requestedAmount: true,
        adminApprovedAmount: true,
      },
    });

    const activeRequestAmount = activeRequests.reduce(
      (total, request) =>
        total + Number(request.adminApprovedAmount ?? request.requestedAmount),
      0,
    );
    const availableAdvance = Math.max(
      0,
      maximumEligibleAmount - activeRequestAmount,
    );

    /**
     * KYC Status
     */
    const requiredKycVerified = REQUIRED_KYC_DOCUMENTS.every((type) =>
      employee.kycDocuments.some(
        (document) =>
          document.documentType === type && document.status === 'VERIFIED',
      ),
    );
    const kycStatus =
      employee.kycDocuments.length > 0
        ? requiredKycVerified
          ? 'VERIFIED'
          : employee.kycDocuments.some(
                (document) => document.status === 'REJECTED',
              )
            ? 'REJECTED'
            : 'PENDING'
        : 'NOT_SUBMITTED';

    /**
     * Bank Account Status
     */
    const bankAccountStatus = employee.bankAccount
      ? employee.bankAccount.verified
        ? 'VERIFIED'
        : 'PENDING'
      : 'NOT_ADDED';

    return {
      /**
       * Employee Info
       */
      id: employee.id,
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      employeeCode: employee.employeeCode,
      profilePhotoUrl: employee.profilePhotoUrl,

      /**
       * Salary Info
       */
      salaryInHand: Number(employee.salaryInHand),
      maximumEligibleAmount,
      activeRequestAmount,
      availableAdvance,

      /**
       * Employer Info
       */
      employerId: employee.employer.id,
      employerName: employee.employer.companyName,

      /**
       * Payroll Info
       */
      payrollDate: employee.employer.payrollDate,
      payrollCutoffDate: employee.employer.payrollCutoffDate,

      /**
       * KYC & Bank
       */
      kycStatus,
      bankAccountStatus,

      /**
       * Employee Status
       */
      appActivated: employee.appActivated,
      employmentStatus: employee.employmentStatus,
    };
  }

  async getAppState(userId: string) {
    const profile = await this.findByUserId(userId);
    const currentRequest = await this.prisma.loanApplication.findFirst({
      where: {
        employeeId: profile.id,
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
      },
      include: {
        repayment: true,
        disbursal: true,
        platformFee: { select: APP_STATE_PLATFORM_FEE_SELECT },
        history: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    const notificationCount =
      await this.notificationsService.countUnread(userId);

    // Salary advance setup is intentionally limited to KYC + bank.
    // The request-scoped platform fee is payable only after employer approval,
    // so employees are never charged for requests their employer rejects.
    const setup = [
      {
        key: 'KYC',
        label: 'KYC Documents',
        status: profile.kycStatus,
        completed: profile.kycStatus === 'VERIFIED',
      },
      {
        key: 'BANK_ACCOUNT',
        label: 'Bank Account',
        status: profile.bankAccountStatus,
        completed: profile.bankAccountStatus === 'VERIFIED',
      },
    ];
    const completedSetup = setup.filter((item) => item.completed).length;
    const platformFeeConfig = await this.platformFeesService.getConfig();

    return {
      profile: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        employeeCode: profile.employeeCode,
        profilePhotoUrl: profile.profilePhotoUrl,
        appActivated: profile.appActivated,
        employmentStatus: profile.employmentStatus,
      },
      employer: {
        id: profile.employerId,
        name: profile.employerName,
      },
      payroll: {
        payrollDate: profile.payrollDate,
        payrollCutoffDate: profile.payrollCutoffDate,
      },
      setup,
      profileCompletion: {
        completed: completedSetup,
        total: setup.length,
        percentage: Math.round((completedSetup / setup.length) * 100),
      },
      platformFee: platformFeeConfig,
      salaryAdvance: {
        salaryInHand: profile.salaryInHand,
        maximumEligibleAmount: profile.maximumEligibleAmount,
        usedLimit: profile.activeRequestAmount,
        availableAdvance: profile.availableAdvance,
      },
      currentRequest: currentRequest
        ? {
            id: currentRequest.id,
            applicationNumber: currentRequest.applicationNumber,
            requestedAmount: Number(currentRequest.requestedAmount),
            adminApprovedAmount:
              currentRequest.adminApprovedAmount == null
                ? null
                : Number(currentRequest.adminApprovedAmount),
            status: currentRequest.status,
            submittedAt: currentRequest.submittedAt,
            platformFee: currentRequest.platformFee
              ? {
                  id: currentRequest.platformFee.id,
                  amount: Number(currentRequest.platformFee.amount),
                  currency: currentRequest.platformFee.currency,
                  status: currentRequest.platformFee.status,
                  paidAt: currentRequest.platformFee.paidAt,
                  latestPaymentOrder:
                    currentRequest.platformFee.paymentOrders?.[0] ?? null,
                }
              : null,
            repaymentDate: currentRequest.repayment?.dueDate ?? null,
            totalPayable:
              currentRequest.repayment?.totalAmount === undefined ||
              currentRequest.repayment?.totalAmount === null
                ? null
                : Number(currentRequest.repayment.totalAmount),
            allowedActions: {
              cancel: currentRequest.status === 'SUBMITTED',
            },
          }
        : null,
      nextAction: this.resolveEmployeeNextAction({
        kycStatus: profile.kycStatus,
        bankAccountStatus: profile.bankAccountStatus,
        currentRequestStatus: currentRequest?.status ?? null,
        availableAdvance: profile.availableAdvance,
      }),
      notifications: notificationCount,
    };
  }

  async getProfile(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
      include: {
        employer: true,
        kycDocuments: true,
        bankAccount: true,
        // user NOT included here — termsAcceptedAt is read via raw query below
        // so the endpoint doesn't break if the migration hasn't been applied.
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    // Read termsAcceptedAt via raw SQL to tolerate the column being missing pre-migration.
    let termsAccepted = false;
    try {
      const rows = await this.prisma.$queryRaw<{ termsAcceptedAt: Date | null }[]>`
        SELECT "termsAcceptedAt" FROM users WHERE id = ${userId} LIMIT 1
      `;
      termsAccepted = !!rows[0]?.termsAcceptedAt;
    } catch {
      termsAccepted = false;
    }

    const requiredVerified = ['PAN', 'AADHAR', 'SALARY_SLIP'].every((type) =>
      employee.kycDocuments.some(
        (document) =>
          document.documentType === type && document.status === 'VERIFIED',
      ),
    );
    const kycStatus = requiredVerified
      ? 'VERIFIED'
      : employee.kycDocuments.length > 0
        ? employee.kycDocuments.some(
            (document) => document.status === 'REJECTED',
          )
          ? 'REJECTED'
          : 'PENDING'
        : 'NOT_SUBMITTED';

    return {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      employeeCode: employee.employeeCode,
      employerId: employee.employerId,
      employerName: employee.employer.companyName,
      profilePhotoUrl: employee.profilePhotoUrl,
      kycStatus,
      bankVerified: employee.bankAccount?.verified ?? false,
      appActivated: employee.appActivated,
      employmentStatus: employee.employmentStatus,
      termsAccepted,
    };
  }

  async uploadProfilePhoto(userId: string, file: any) {
    this.assertImageUpload(file);

    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const upload = await this.filesService.saveUploadedFile(
      file,
      userId,
      UploadType.PROFILE_PHOTO,
    );

    return this.prisma.employee.update({
      where: {
        id: employee.id,
      },
      data: {
        profilePhotoUrl: upload.key,
      },
    });
  }

  async findAllForEmployer(employerId: string) {
    const employees = await this.prisma.employee.findMany({
      where: {
        employerId,
      },
      include: {
        employer: true,
        user: { select: { passwordChanged: true } },
        kycDocuments: {
          select: { status: true },
          orderBy: { createdAt: 'desc' },
        },
        bankAccount: { select: { verified: true } },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return employees.map((emp) => {
      // Derive kycStatus from documents
      const hasVerified = emp.kycDocuments.some((d) => d.status === 'VERIFIED');
      const hasPending = emp.kycDocuments.some((d) => d.status === 'PENDING');
      const hasRejected = emp.kycDocuments.some((d) => d.status === 'REJECTED');
      const kycStatus =
        emp.kycDocuments.length === 0
          ? 'NOT_SUBMITTED'
          : hasVerified
            ? 'VERIFIED'
            : hasPending
              ? 'PENDING'
              : hasRejected
                ? 'REJECTED'
                : 'PENDING';

      // Derive bankAccountStatus
      const bankAccountStatus = !emp.bankAccount
        ? 'NOT_ADDED'
        : emp.bankAccount.verified
          ? 'VERIFIED'
          : 'PENDING';

      const { kycDocuments, bankAccount, user, ...rest } = emp;
      return { ...rest, kycStatus, bankAccountStatus, passwordChanged: user?.passwordChanged ?? false };
    });
  }

  private employeeAuditValue(employee: {
    employerId: string;
    employeeCode: string;
    name: string;
    email: string;
    phone: string;
    salaryInHand: unknown;
    employmentStatus: string;
    appActivated: boolean;
  }) {
    return {
      employerId: employee.employerId,
      employeeCode: employee.employeeCode,
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      salaryInHand: Number(employee.salaryInHand),
      employmentStatus: employee.employmentStatus,
      appActivated: employee.appActivated,
    };
  }

  private assertImageUpload(file: any) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException(
        'Only JPG, PNG and WebP images are allowed',
      );
    }
  }

  private resolveEmployeeNextAction({
    kycStatus,
    bankAccountStatus,
    currentRequestStatus,
    availableAdvance,
  }: {
    kycStatus: string;
    bankAccountStatus: string;
    currentRequestStatus: string | null;
    availableAdvance: number;
  }) {
    if (currentRequestStatus === 'AWAITING_PLATFORM_FEE_PAYMENT') {
      return {
        code: 'PAY_PLATFORM_FEE',
        label: 'Pay platform fee',
      };
    }

    if (currentRequestStatus) {
      return {
        code: 'TRACK_REQUEST',
        label: 'Track request',
      };
    }

    if (kycStatus !== 'VERIFIED') {
      return {
        code: 'COMPLETE_KYC',
        label: 'Complete KYC',
      };
    }

    if (bankAccountStatus !== 'VERIFIED') {
      return {
        code: 'ADD_BANK_ACCOUNT',
        label: 'Add bank account',
      };
    }

    if (availableAdvance <= 0) {
      return {
        code: 'VIEW_REPAYMENT',
        label: 'View repayment',
      };
    }

    return {
      code: 'REQUEST_ADVANCE',
      label: 'Request advance',
    };
  }

  async getPeerActivity(userId: string) {
    // Resolve current employee → employerId
    const me = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true, employerId: true },
    });

    if (!me) throw new NotFoundException('Employee not found');

    const { employerId, id: myId } = me;

    // Total employees in this company (excluding self)
    const totalEmployees = await this.prisma.employee.count({
      where: { employerId, id: { not: myId } },
    });

    // Employees who have had at least one advance disbursed/repaid
    const activeUsers = await this.prisma.employee.count({
      where: {
        employerId,
        id: { not: myId },
        loanApplications: {
          some: {
            status: {
              in: ['DISBURSED', 'REPAYMENT_SCHEDULED', 'REPAID'],
            },
          },
        },
      },
    });

    // Collect up to 5 distinct employees with active advances — initials only for privacy
    const activeEmployees = await this.prisma.employee.findMany({
      where: {
        employerId,
        id: { not: myId },
        loanApplications: {
          some: {
            status: { in: ['DISBURSED', 'REPAYMENT_SCHEDULED', 'REPAID'] },
          },
        },
      },
      select: { name: true },
      take: 5,
    });

    const initials = activeEmployees.map((e) => {
      const parts = (e.name ?? '').trim().split(/\s+/);
      const first = parts[0]?.[0]?.toUpperCase() ?? '?';
      const second = parts[1]?.[0]?.toUpperCase() ?? '';
      return second ? `${first}${second}` : first;
    });

    return {
      totalEmployees,
      activeUsers,
      percentageActive:
        totalEmployees > 0
          ? Math.round((activeUsers / totalEmployees) * 100)
          : 0,
      initials,
    };
  }

  private async writeAuditLog(data: {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
  }) {
    const auditData: {
      userId: string;
      action: string;
      entityType: string;
      entityId: string;
      oldValue?: Record<string, unknown>;
      newValue?: Record<string, unknown>;
    } = {
      userId: data.userId,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
    };

    if (data.oldValue !== null) {
      auditData.oldValue = data.oldValue;
    }

    if (data.newValue !== null) {
      auditData.newValue = data.newValue;
    }

    await this.auditLogsService.log(auditData);
  }

  async resendActivationEmail(
    employeeId: string,
    employerId?: string,
  ): Promise<{ message: string }> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true, employer: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    if (employerId && employee.employerId !== employerId) {
      throw new ForbiddenException('Access denied');
    }

    if (employee.user?.passwordChanged) {
      throw new BadRequestException(
        'This employee has already set their own password and does not need an activation email.',
      );
    }

    const temporaryPassword = this.generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    await this.prisma.user.update({
      where: { id: employee.userId ?? undefined },
      data: { password: hashedPassword, passwordChanged: false },
    });

    this.logTemporaryEmployeePassword({
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      email: employee.email,
      password: temporaryPassword,
    });

    await this.sendEmployeeCreatedEmail(
      employee.email,
      employee.name,
      employee.employer.companyName,
      temporaryPassword,
    );

    return { message: 'Activation email resent successfully' };
  }

  private generateTemporaryPassword() {
    // bcrypt stores its own per-password salt; this extra random segment raises
    // temporary credential entropy before the password is hashed and emailed.
    const entropy = randomBytes(12).toString('base64url');
    const saltSegment = randomBytes(6).toString('base64url');

    return `MobPae-${entropy}-${saltSegment}!1`;
  }

  private logTemporaryEmployeePassword(data: {
    employeeId: string;
    employeeCode: string;
    email: string;
    password: string;
  }) {
    console.log(
      '\n================ EMPLOYEE LOGIN CREDENTIALS ================',
    );
    console.log(`Employee ID   : ${data.employeeId}`);
    console.log(`Employee Code : ${data.employeeCode}`);
    console.log(`Email         : ${data.email}`);
    console.log(`Password      : ${data.password}`);
    console.log(
      '============================================================\n',
    );
  }

  private async sendEmployeeCreatedEmail(
    email: string,
    name: string,
    employerName: string,
    temporaryPassword: string,
  ) {
    try {
      await this.emailService.sendEmployeeCreatedEmail({
        to: email,
        employeeName: name,
        employerName,
        loginEmail: email,
        temporaryPassword,
        loginUrl:
          process.env.EMPLOYEE_LOGIN_URL ??
          process.env.FRONTEND_URL ??
          'https://mobpae.com/login',
      });
    } catch (error) {
      console.error('Failed to send employee created email', error);
    }
  }
}
