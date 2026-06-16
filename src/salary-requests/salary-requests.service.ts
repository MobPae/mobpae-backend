import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSalaryRequestDto } from './dto/create-salary-request.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { MembershipService } from '../membership/membership.service';

import { PayrollUtil } from '../common/utils/payroll.util';

@Injectable()
export class SalaryRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly settingsService: SettingsService,
    private readonly membershipService: MembershipService,
  ) {}

  /**
   * Creates a salary advance request.
   *
   * Validation Flow:
   * 1. Employee must exist.
   * 2. Admin advance settings define the available limit.
   * 3. Requested amount must not exceed the calculated available advance.
   * 4. KYC, bank verification, multiple request, and outstanding balance
   *    settings are enforced before submission.
   *
   * Result:
   * Request is submitted for employer approval.
   */
  async create(userId: string, dto: CreateSalaryRequestDto) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    const settings = await this.settingsService.getAdvanceSettings();

    const availableAdvance = this.settingsService.calculateAvailableAdvance(
      Number(employee.salaryInHand),
      settings,
    );

    if (availableAdvance <= 0) {
      throw new BadRequestException(
        `Minimum salary required is ₹${settings.minimumSalary}`,
      );
    }

    if (Number(dto.amount) > availableAdvance) {
      throw new BadRequestException(
        `Requested amount exceeds available advance of ₹${availableAdvance}`,
      );
    }

    if (settings.requireKyc) {
      const verifiedDocs = await this.prisma.kycDocument.findMany({
        where: {
          employeeId: employee.id,
          status: 'VERIFIED',
        },
      });

      const kycCompleted = ['PAN', 'AADHAR', 'SALARY_SLIP'].every((type) =>
        verifiedDocs.some((doc) => doc.documentType === type),
      );

      if (!kycCompleted) {
        throw new BadRequestException('Employee KYC is not completed');
      }
    }

    if (settings.requireBankVerification) {
      const bankAccount = await this.prisma.employeeBankAccount.findUnique({
        where: {
          employeeId: employee.id,
        },
      });

      if (!bankAccount) {
        throw new BadRequestException('Employee bank account not found');
      }

      if (!bankAccount.verified) {
        throw new BadRequestException('Employee bank account is not verified');
      }
    }

    const membershipActive = await this.membershipService.isActive(employee.id);

    if (!membershipActive) {
      throw new BadRequestException('Employee membership is not active');
    }

    if (!settings.allowMultipleRequestsPerCycle) {
      const activeRequest = await this.prisma.salaryRequest.findFirst({
        where: {
          employeeId: employee.id,
          status: {
            in: [
              'SUBMITTED',
              'EMPLOYER_APPROVED',
              'READY_FOR_DISBURSAL',
              'DISBURSED',
              'REPAYMENT_SCHEDULED',
            ],
          },
        },
      });

      if (activeRequest) {
        throw new BadRequestException('Employee already has an active request');
      }
    }

    if (!settings.allowRequestWithOutstandingBalance) {
      const outstandingRepayment = await this.prisma.repayment.findFirst({
        where: {
          salaryRequest: {
            employeeId: employee.id,
          },
          status: {
            in: ['SCHEDULED', 'OVERDUE'],
          },
        },
      });

      if (outstandingRepayment) {
        throw new BadRequestException(
          'Employee has an outstanding payment balance',
        );
      }
    }

    return this.prisma.salaryRequest.create({
      data: {
        employeeId: employee.id,
        employerId: employee.employerId,
        amount: dto.amount,
      },
    });
  }

  async findByEmployee(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        id: employeeId,
      },
      include: {
        employer: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const settings = await this.settingsService.getAdvanceSettings();

    const requests = await this.prisma.salaryRequest.findMany({
      where: {
        employeeId,
      },
      include: {
        repayment: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return requests.map((request) => {
      if (request.repayment) {
        return {
          id: request.id,
          amount: Number(request.amount),
          approvedAmount: Number(request.approvedAmount ?? request.amount),
          status: request.status,
          statusLabel: this.getStatusLabel(request.status),
          statusColor: this.getStatusColor(request.status),
          requestedAt: request.requestedAt,
          repaymentDate: request.repaymentDate,
          interestAmount: Number(request.repayment.interestAmount),
          totalAmount: Number(request.repayment.totalAmount),
          interestDays: request.repayment.interestDays,
          dueDate: request.repayment.dueDate,
        };
      }

      const projection = PayrollUtil.calculateRepayment(
        Number(request.approvedAmount ?? request.amount),
        request.requestedAt,
        employee.employer.payrollCutoffDate,
        employee.employer.payrollDate,
        settings.interestChargePercentage,
      );

      return {
        id: request.id,
        amount: Number(request.amount),
        approvedAmount: Number(request.approvedAmount ?? request.amount),
        status: request.status,
        statusLabel: this.getStatusLabel(request.status),
        statusColor: this.getStatusColor(request.status),
        requestedAt: request.requestedAt,
        repaymentDate: request.repaymentDate,
        interestAmount: projection.interestAmount,
        totalAmount: projection.totalAmount,
        interestDays: projection.interestDays,
        dueDate: projection.dueDate,
      };
    });
  }

  async findPendingByEmployer(employerId: string) {
    return this.prisma.salaryRequest.findMany({
      where: {
        employee: {
          employerId,
        },
        status: 'SUBMITTED',
      },
      include: {
        employee: true,
      },
    });
  }

  async findAllForAdmin() {
    return this.prisma.salaryRequest.findMany({
      include: {
        employee: {
          include: {
            employer: true,
          },
        },
        disbursal: true,
        repayment: true,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });
  }

  /**
   * Employer approval of salary advance request.
   *
   * Business Flow:
   * 1. Validate request exists.
   * 2. Validate request is in SUBMITTED status.
   * 3. Update status to EMPLOYER_APPROVED.
   * 4. Notify employee.
   *
   * Result:
   * Request becomes eligible for disbursal.
   */
  async approve(id: string, userId: string) {
    const request = await this.prisma.salaryRequest.findUnique({
      where: {
        id,
      },
      include: {
        employee: true,
      },
    });

    if (!request) {
      throw new BadRequestException('Salary request not found');
    }

    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new BadRequestException('Employer not found');
    }

    if (request?.employerId !== employer.id) {
      throw new BadRequestException('Unauthorized request access');
    }

    if (request.status !== 'SUBMITTED') {
      throw new BadRequestException('Only submitted requests can be approved');
    }

    const updatedRequest = await this.prisma.salaryRequest.update({
      where: {
        id,
      },
      data: {
        status: 'EMPLOYER_APPROVED',
      },
    });

    if (request.employee.userId) {
      await this.notificationsService.createSystemNotification(
        request.employee.userId,
        'Salary Request Approved',
        'Your salary advance request has been approved.',
      );
    }

    return updatedRequest;
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

    return this.prisma.salaryRequest.findMany({
      where: {
        employerId: employer.id,
      },
      include: {
        employee: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async reject(id: string, remarks: string, userId: string) {
    const request = await this.prisma.salaryRequest.findUnique({
      where: {
        id,
      },

      include: {
        employee: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Salary request not found');
    }

    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new BadRequestException('Employer not found');
    }

    if (request.employerId !== employer.id) {
      throw new BadRequestException('Unauthorized request access');
    }

    if (request.status !== 'SUBMITTED') {
      throw new BadRequestException('Only submitted requests can be rejected');
    }

    const updatedRequest = await this.prisma.salaryRequest.update({
      where: {
        id,
      },

      data: {
        status: 'EMPLOYER_REJECTED',

        remarks,
      },
    });

    if (request.employee.userId) {
      await this.notificationsService.createSystemNotification(
        request.employee.userId,

        'Salary Request Rejected',

        remarks || 'Your salary advance request has been rejected.',
      );
    }

    return updatedRequest;
  }

  async preview(userId: string, amount: number) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
      include: {
        employer: true,
      },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    /**
     * Advance Settings
     */
    const settings = await this.settingsService.getAdvanceSettings();

    /**
     * Available Advance
     *
     * Business Rule:
     * MIN(
     *   Salary × Advance Percentage,
     *   Maximum Advance
     * )
     */
    const availableAdvance = Math.min(
      Number(employee.salaryInHand) *
        (Number(settings.advancePercentage) / 100),
      Number(settings.maximumAdvance),
    );

    /**
     * Validate requested amount
     */
    if (amount > availableAdvance) {
      throw new BadRequestException(
        `Maximum eligible advance is ₹${availableAdvance}`,
      );
    }

    if (amount <= 0) {
      throw new BadRequestException('Advance amount must be greater than zero');
    }

    /**
     * Interest Calculation
     */
    const annualInterestRate = Number(settings.interestChargePercentage);

    const repayment = PayrollUtil.calculateRepayment(
      amount,
      new Date(),
      employee.employer.payrollCutoffDate,
      employee.employer.payrollDate,
      annualInterestRate,
    );

    /**
     * Employee App Preview Response
     */
    return {
      /**
       * Requested Amount
       */
      requestedAmount: amount,

      /**
       * Amount employee receives
       * Processing fee is zero for MVP
       */
      youReceive: amount,

      /**
       * Fees & Interest
       */
      processingFee: 0,

      interestRate: annualInterestRate,
      interestDays: repayment.interestDays,
      interestAmount: repayment.interestAmount,

      /**
       * Recovery Details
       */
      totalRecovery: repayment.totalAmount,
      recoveryDate: repayment.dueDate,

      /**
       * Additional Information
       */
      principalAmount: amount,
      availableAdvance,
    };
  }

  /**

  * Get complete salary request details.
  *
  * Used by:
  * - Employer Request Details screen
  * - Admin Review screen
  * - Future Request Tracking page
  *
  * Returns:
  * - Salary request details
  * - Employee details
  * - Repayment details (if created)
  * - Disbursal details (if disbursed)
 */
  async findOne(id: string) {
    const salaryRequest = await this.prisma.salaryRequest.findUnique({
      where: {
        id,
      },
      include: {
        employee: {
          include: {
            employer: true,
          },
        },
        repayment: true,
        disbursal: true,
      },
    });

    if (!salaryRequest) {
      throw new NotFoundException('Salary request not found');
    }

    return {
      id: salaryRequest.id,

      amount: salaryRequest.amount,
      approvedAmount: salaryRequest.approvedAmount,

      status: salaryRequest.status,

      requestedAt: salaryRequest.requestedAt,

      remarks: salaryRequest.remarks,

      employee: {
        id: salaryRequest.employee.id,
        employeeCode: salaryRequest.employee.employeeCode,
        name: salaryRequest.employee.name,
        email: salaryRequest.employee.email,
        phone: salaryRequest.employee.phone,
        salaryInHand: salaryRequest.employee.salaryInHand,
      },

      repayment: salaryRequest.repayment,

      disbursal: salaryRequest.disbursal,
    };
  }

  async findByUserId(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.findByEmployee(employee.id);
  }

  private getStatusLabel(status: string) {
    switch (status) {
      case 'SUBMITTED':
        return 'Pending Approval';

      case 'EMPLOYER_APPROVED':
        return 'Approved';

      case 'READY_FOR_DISBURSAL':
        return 'Ready for Disbursal';

      case 'DISBURSED':
        return 'Disbursed';

      case 'REPAID':
        return 'Repaid';

      case 'EMPLOYER_REJECTED':
        return 'Rejected';

      default:
        return status;
    }
  }

  private getStatusColor(status: string) {
    switch (status) {
      case 'SUBMITTED':
        return 'warning';

      case 'EMPLOYER_APPROVED':
        return 'success';

      case 'READY_FOR_DISBURSAL':
        return 'info';

      case 'DISBURSED':
        return 'primary';

      case 'REPAID':
        return 'success';

      case 'EMPLOYER_REJECTED':
        return 'danger';

      default:
        return 'default';
    }
  }
}
