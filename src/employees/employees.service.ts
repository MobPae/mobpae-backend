import {
  BadRequestException,
  ConflictException,
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
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import {
  containsSearch,
  getOrderBy,
  getPagination,
  hasSearch,
  paginate,
} from '../common/utils/pagination.util';
import { EmployeeListQueryDto } from './dto/employee-list-query.dto';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly filesService: FilesService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
  ) {}

  async create(dto: CreateEmployeeDto, userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
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
      dto,
      userId,
      employer.id,
      hashedPassword,
    );

    console.log('TEMP EMPLOYEE LOGIN PASSWORD', {
      employeeId: employee.id,
      email: dto.email,
      password: temporaryPassword,
    });

    await this.sendEmployeeCreatedEmail(
      dto.email,
      dto.name,
      employer.companyName,
      temporaryPassword,
    );

    return {
      employee,
      credentials: {
        email: dto.email,
        password: temporaryPassword,
      },
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

        if (
          target.includes('employerId') &&
          target.includes('employeeCode')
        ) {
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

  async update(employeeId: string, dto: UpdateEmployeeDto, userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
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
      userId,
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
    userId: string,
  ) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
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
      userId,
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
    userId: string,
  ) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
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
      userId,
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
        selfieStatus: true,
        selfieUrl: true,
        selfieVerifiedAt: true,
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

    const selfie = employee.selfieStatus === 'VERIFIED';

    return {
      pan,
      aadhar,
      salarySlip,
      selfie,
      selfieStatus: employee.selfieStatus,
      selfieUrl: employee.selfieUrl,
      selfieVerifiedAt: employee.selfieVerifiedAt,
      kycCompleted: pan && aadhar && salarySlip && selfie,
    };
  }

  // Bulk Create employees with error handling and login id/password generation
  async bulkCreate(userId: string, employees: CreateEmployeeDto[]) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    const created: {
      employeeCode: string;
      name: string;
      email: string;
      password: string;
    }[] = [];

    const errors: {
      row: number;
      employeeCode: string;
      email: string;
      message: string;
    }[] = [];

    for (let index = 0; index < employees.length; index++) {
      const employee = employees[index];

      try {
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

              salaryInHand: Number(employee.salaryInHand),

              employmentStatus: 'ACTIVE',
              appActivated: false,
            },
          });

          await tx.auditLog.create({
            data: {
              userId,
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
          password: temporaryPassword,
        });

        console.log('TEMP EMPLOYEE LOGIN PASSWORD', {
          employeeId: createdEmployee.id,
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
   * - Membership Banner
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
        salaryLimit: true,
        membership: true,
        bankAccount: true,
        kycDocuments: {
          take: 1,
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    /**
     * Salary Advance Settings
     *
     * Available Advance =
     * MIN(
     *   Salary × Advance Percentage,
     *   Maximum Advance
     * )
     */
    const advancePercentageSetting = await this.prisma.setting.findUnique({
      where: {
        key: 'advancePercentage',
      },
    });

    const maximumAdvanceSetting = await this.prisma.setting.findUnique({
      where: {
        key: 'maximumAdvance',
      },
    });

    const advancePercentage = Number(advancePercentageSetting?.value ?? 40);

    const maximumAdvance = Number(maximumAdvanceSetting?.value ?? 10000);

    const percentageBasedAmount =
      Number(employee.salaryInHand) * (advancePercentage / 100);

    const availableAdvance = Math.min(percentageBasedAmount, maximumAdvance);

    /**
     * KYC Status
     */
    const kycStatus =
      employee.kycDocuments.length > 0 || employee.selfieUrl
        ? employee.selfieStatus === 'VERIFIED'
          ? 'SUBMITTED'
          : employee.selfieStatus
        : 'NOT_SUBMITTED';

    /**
     * Bank Account Status
     */
    const bankAccountStatus = employee.bankAccount ? 'ADDED' : 'NOT_ADDED';

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
      selfieUrl: employee.selfieUrl,
      selfieStatus: employee.selfieStatus,
      selfieVerifiedAt: employee.selfieVerifiedAt,

      /**
       * Salary Info
       */
      salaryInHand: Number(employee.salaryInHand),
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

      /**
       * Membership
       */
      membershipActive: !!employee.membership,

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

  async getProfile(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
      include: {
        employer: true,
        kycDocuments: true,
        bankAccount: true,
        membership: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const requiredVerified = ['PAN', 'AADHAR', 'SALARY_SLIP'].every((type) =>
      employee.kycDocuments.some(
        (document) =>
          document.documentType === type && document.status === 'VERIFIED',
      ),
    );
    const selfieVerified = employee.selfieStatus === 'VERIFIED';
    const kycStatus =
      requiredVerified && selfieVerified
        ? 'VERIFIED'
        : employee.kycDocuments.length > 0 || employee.selfieUrl
          ? employee.selfieStatus === 'REJECTED'
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
      selfieUrl: employee.selfieUrl,
      selfieStatus: employee.selfieStatus,
      selfieVerifiedAt: employee.selfieVerifiedAt,
      kycStatus,
      bankVerified: employee.bankAccount?.verified ?? false,
      membershipActive: employee.membership?.status === 'ACTIVE',
      appActivated: employee.appActivated,
      employmentStatus: employee.employmentStatus,
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

    const upload = await this.filesService.saveUploadedFile(file, { userId });

    return this.prisma.employee.update({
      where: {
        id: employee.id,
      },
      data: {
        profilePhotoUrl: upload.filePath,
      },
    });
  }

  async uploadSelfie(userId: string, file: any) {
    this.assertImageUpload(file);

    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const upload = await this.filesService.saveUploadedFile(file, { userId });
    const updatedEmployee = await this.prisma.employee.update({
      where: {
        id: employee.id,
      },
      data: {
        selfieUrl: upload.filePath,
        selfieStatus: 'PENDING',
        selfieVerifiedAt: null,
        selfieVerifiedBy: null,
      },
    });

    const admins = await this.prisma.user.findMany({
      where: {
        role: 'ADMIN',
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.createSystemNotification(
          admin.id,
          'Selfie Submitted',
          `${employee.name} submitted a selfie for verification.`,
        ),
      ),
    );

    await this.writeAuditLog({
      userId,
      action: 'SELFIE_SUBMITTED',
      entityType: 'EMPLOYEE',
      entityId: employee.id,
      oldValue: {
        selfieUrl: employee.selfieUrl,
        selfieStatus: employee.selfieStatus,
        selfieVerifiedAt: employee.selfieVerifiedAt?.toISOString() ?? null,
        selfieVerifiedBy: employee.selfieVerifiedBy,
      },
      newValue: {
        selfieUrl: updatedEmployee.selfieUrl,
        selfieStatus: updatedEmployee.selfieStatus,
        selfieVerifiedAt:
          updatedEmployee.selfieVerifiedAt?.toISOString() ?? null,
        selfieVerifiedBy: updatedEmployee.selfieVerifiedBy,
      },
    });

    return updatedEmployee;
  }

  async verifySelfie(employeeId: string, adminUserId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        id: employeeId,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    if (!employee.selfieUrl) {
      throw new BadRequestException('Selfie has not been uploaded');
    }

    const verifiedAt = new Date();
    const updatedEmployee = await this.prisma.employee.update({
      where: {
        id: employeeId,
      },
      data: {
        selfieStatus: 'VERIFIED',
        selfieVerifiedAt: verifiedAt,
        selfieVerifiedBy: adminUserId,
      },
    });

    if (employee.userId) {
      await this.notificationsService.createSystemNotification(
        employee.userId,
        'Selfie Verified',
        'Your selfie verification has been approved.',
      );
    }

    await this.writeAuditLog({
      userId: adminUserId,
      action: 'SELFIE_VERIFIED',
      entityType: 'EMPLOYEE',
      entityId: employee.id,
      oldValue: {
        selfieStatus: employee.selfieStatus,
        selfieVerifiedAt: employee.selfieVerifiedAt?.toISOString() ?? null,
        selfieVerifiedBy: employee.selfieVerifiedBy,
      },
      newValue: {
        selfieStatus: updatedEmployee.selfieStatus,
        selfieVerifiedAt:
          updatedEmployee.selfieVerifiedAt?.toISOString() ?? null,
        selfieVerifiedBy: updatedEmployee.selfieVerifiedBy,
      },
    });

    return updatedEmployee;
  }

  async rejectSelfie(employeeId: string, remarks: string, adminUserId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        id: employeeId,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    if (!employee.selfieUrl) {
      throw new BadRequestException('Selfie has not been uploaded');
    }

    const updatedEmployee = await this.prisma.employee.update({
      where: {
        id: employeeId,
      },
      data: {
        selfieStatus: 'REJECTED',
        selfieVerifiedAt: null,
        selfieVerifiedBy: adminUserId,
      },
    });

    if (employee.userId) {
      await this.notificationsService.createSystemNotification(
        employee.userId,
        'Selfie Rejected',
        remarks || 'Your selfie verification has been rejected.',
      );
    }

    await this.writeAuditLog({
      userId: adminUserId,
      action: 'SELFIE_REJECTED',
      entityType: 'EMPLOYEE',
      entityId: employee.id,
      oldValue: {
        selfieStatus: employee.selfieStatus,
        selfieVerifiedAt: employee.selfieVerifiedAt?.toISOString() ?? null,
        selfieVerifiedBy: employee.selfieVerifiedBy,
      },
      newValue: {
        selfieStatus: updatedEmployee.selfieStatus,
        selfieVerifiedAt:
          updatedEmployee.selfieVerifiedAt?.toISOString() ?? null,
        selfieVerifiedBy: updatedEmployee.selfieVerifiedBy,
        remarks,
      },
    });

    return updatedEmployee;
  }

  async findAllForEmployer(userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    return this.prisma.employee.findMany({
      where: {
        employerId: employer.id,
      },
      include: {
        employer: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
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

  private generateTemporaryPassword() {
    return `MobPae-${randomBytes(8).toString('hex')}!1`;
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
