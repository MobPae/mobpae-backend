import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

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

    const temporaryPassword = this.generateTemporaryPassword();

    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    const employee = await this.prisma.$transaction(async (tx) => {
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
          employerId: employer.id,
          employeeCode: dto.employeeCode,
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          salaryInHand: dto.salaryInHand,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
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

    return {
      employee,
      credentials: {
        email: dto.email,
        password: temporaryPassword,
      },
    };
  }

  async findAll() {
    return this.prisma.employee.findMany({
      include: {
        employer: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
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

        const user = await this.prisma.user.create({
          data: {
            email: employee.email,
            password: hashedPassword,
            role: 'EMPLOYEE',
            isActive: true,
            passwordChanged: false,
          },
        });

        const createdEmployee = await this.prisma.employee.create({
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

        await this.writeAuditLog({
          userId,
          action: 'EMPLOYEE_CREATED',
          entityType: 'EMPLOYEE',
          entityId: createdEmployee.id,
          oldValue: null,
          newValue: {
            employerId: createdEmployee.employerId,
            employeeCode: createdEmployee.employeeCode,
            name: createdEmployee.name,
            email: createdEmployee.email,
            employmentStatus: createdEmployee.employmentStatus,
            appActivated: createdEmployee.appActivated,
          },
        });

        created.push({
          employeeCode: employee.employeeCode,
          name: employee.name,
          email: employee.email,
          password: temporaryPassword,
        });
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
      employee.kycDocuments.length > 0 ? 'SUBMITTED' : 'NOT_SUBMITTED';

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

    try {
      await this.prisma.auditLog.create({
        data: auditData as any,
      });
    } catch (error) {
      console.error('Failed to write business audit log', error);
    }
  }

  private generateTemporaryPassword() {
    return `MobPae-${randomBytes(8).toString('hex')}!1`;
  }
}
