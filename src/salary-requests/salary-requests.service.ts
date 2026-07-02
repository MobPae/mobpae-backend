import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSalaryRequestDto } from './dto/create-salary-request.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { MembershipService } from '../membership/membership.service';
import { EmailService } from '../email/email.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

import { PayrollUtil } from '../common/utils/payroll.util';
import { REQUIRED_KYC_DOCUMENTS } from '../common/constants/kyc.constants';
import {
  containsSearch,
  getOrderBy,
  getPagination,
  hasSearch,
  paginate,
} from '../common/utils/pagination.util';
import { SalaryRequestListQueryDto } from './dto/salary-request-list-query.dto';
import type { SalaryRequest } from '@prisma/client';
import {
  BulkSalaryRequestAction,
  BulkSalaryRequestActionDto,
} from './dto/bulk-salary-request-action.dto';

@Injectable()
export class SalaryRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly settingsService: SettingsService,
    private readonly membershipService: MembershipService,
    private readonly emailService: EmailService,
    private readonly auditLogsService: AuditLogsService,
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
      include: {
        employer: {
          select: { userId: true },
        },
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

      const kycCompleted = REQUIRED_KYC_DOCUMENTS.every((type) =>
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

    if (!settings.allowMultipleRequestsPerCycle) {
      const activeRequest = await this.prisma.salaryRequest.findFirst({
        where: {
          employeeId: employee.id,
          status: {
            in: [
              'SUBMITTED',
              'EMPLOYER_APPROVED',
              'AWAITING_MEMBERSHIP_PAYMENT',
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

    const salaryRequest = await this.prisma.salaryRequest.create({
      data: {
        employeeId: employee.id,
        employerId: employee.employerId,
        amount: dto.amount,
      },
    });

    await this.writeAuditLog({
      userId,
      action: 'SALARY_REQUEST_CREATED',
      entityType: 'SALARY_REQUEST',
      entityId: salaryRequest.id,
      oldValue: null,
      newValue: this.salaryRequestAuditValue(salaryRequest),
    });

    // Notify employer so they know a request is waiting for their approval
    if (employee.employer?.userId) {
      try {
        await this.notificationsService.createSystemNotification(
          employee.employer.userId,
          'New Salary Advance Request',
          `${employee.name} has submitted a salary advance request of ₹${Number(salaryRequest.amount).toLocaleString('en-IN')}. Please review and approve.`,
        );
      } catch (err) {
        console.error('Failed to send employer notification on salary request create', err);
      }
    }

    try {
      await this.emailService.sendSalaryRequestSubmittedEmail({
        to: employee.email,
        employeeName: employee.name,
        amount: Number(salaryRequest.amount),
        requestDate: salaryRequest.requestedAt,
      });
    } catch (error) {
      console.error('Failed to send salary request submitted email', error);
    }

    return salaryRequest;
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
        disbursal: {
          select: { disbursedAt: true },
        },
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
          disbursedAt: request.disbursal?.disbursedAt ?? null,
          principalAmount: Number(request.repayment.principalAmount),
          interestAmount: Number(request.repayment.interestAmount),
          interestRate: Number(request.repayment.interestRate),
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
        disbursedAt: request.disbursal?.disbursedAt ?? null,
        principalAmount: projection.principalAmount,
        interestAmount: projection.interestAmount,
        interestRate: settings.interestChargePercentage,
        totalAmount: projection.totalAmount,
        interestDays: projection.interestDays,
        dueDate: projection.dueDate,
      };
    });
  }

  async findPendingByEmployer(employerUserId: string) {
    return this.prisma.salaryRequest.findMany({
      where: {
        employee: {
          employer: {
            userId: employerUserId,
          },
        },
        status: 'SUBMITTED',
      },
      include: {
        employee: true,
      },
    });
  }

  async findAllForAdmin(query: SalaryRequestListQueryDto = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const where: any = {
      status: query.status,
      employerId: query.employerId,
      employeeId: query.employeeId,
      createdAt:
        query.startDate || query.endDate
          ? {
              gte: query.startDate ? new Date(query.startDate) : undefined,
              lte: query.endDate ? new Date(query.endDate) : undefined,
            }
          : undefined,
      ...(hasSearch(query)
        ? {
            OR: [
              {
                employee: {
                  name: containsSearch(query),
                },
              },
              {
                employee: {
                  email: containsSearch(query),
                },
              },
              {
                employee: {
                  employeeCode: containsSearch(query),
                },
              },
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
      this.prisma.salaryRequest.findMany({
        where,
        include: {
          employee: {
            include: {
              employer: true,
            },
          },
          disbursal: true,
          repayment: true,
        },
        orderBy: getOrderBy(
          query,
          ['amount', 'approvedAmount', 'status', 'requestedAt', 'createdAt'],
          'requestedAt',
        ),
        skip,
        take,
      }),
      this.prisma.salaryRequest.count({
        where,
      }),
    ]);

    return paginate(data, total, page, limit);
  }

  async bulkAction(dto: BulkSalaryRequestActionDto, userId: string) {
    const results: SalaryRequest[] = [];
    const succeeded: string[] = [];
    const failed: string[] = [];
    const failures: Array<{ id: string; message: string }> = [];

    for (const id of dto.ids) {
      try {
        const request =
          dto.action === BulkSalaryRequestAction.APPROVE
            ? await this.approve(id, userId)
            : await this.reject(
                id,
                dto.remarks || 'Rejected by employer.',
                userId,
              );

        results.push(request);
        succeeded.push(id);
      } catch (error) {
        failed.push(id);
        failures.push({
          id,
          message:
            error instanceof Error
              ? error.message
              : 'Unable to process request',
        });
      }
    }

    return {
      action: dto.action,
      processed: succeeded.length,
      succeeded,
      failed,
      failures,
      results,
    };
  }

  /**
   * Employer approval of salary advance request.
   *
   * Business Flow:
   * 1. Validate request exists and belongs to employer.
   * 2. Validate request is in SUBMITTED status.
   * 3. Check if employee has an active membership.
   *    - Active membership  → transition directly to READY_FOR_DISBURSAL, notify admins.
   *    - No membership      → transition to AWAITING_MEMBERSHIP_PAYMENT, prompt employee to pay.
   * 4. Audit log + notifications.
   */
  async approve(id: string, userId: string) {
    const request = await this.prisma.salaryRequest.findUnique({
      where: { id },
      include: { employee: true },
    });

    if (!request) {
      throw new BadRequestException('Salary request not found');
    }

    const employer = await this.prisma.employer.findUnique({
      where: { userId },
    });

    if (!employer) {
      throw new BadRequestException('Employer not found');
    }

    if (request?.employerId !== employer.id) {
      throw new BadRequestException('Unauthorized request access');
    }

    // Idempotency: already past approval stage
    if (
      request.status === 'EMPLOYER_APPROVED' ||
      request.status === 'AWAITING_MEMBERSHIP_PAYMENT' ||
      request.status === 'READY_FOR_DISBURSAL'
    ) {
      return request;
    }

    if (request.status !== 'SUBMITTED') {
      throw new BadRequestException('Only submitted requests can be approved');
    }

    // Determine target status based on membership before writing to DB
    const membershipActive = await this.membershipService.isActive(
      request.employee.id,
    );
    const targetStatus = membershipActive
      ? 'READY_FOR_DISBURSAL'
      : 'AWAITING_MEMBERSHIP_PAYMENT';

    const transition = await this.prisma.salaryRequest.updateMany({
      where: { id, status: 'SUBMITTED' },
      data: { status: targetStatus },
    });

    const updatedRequest = await this.prisma.salaryRequest.findUnique({
      where: { id },
    });

    if (!updatedRequest) {
      throw new NotFoundException('Salary request not found');
    }

    if (transition.count === 0) {
      if (
        updatedRequest.status === 'AWAITING_MEMBERSHIP_PAYMENT' ||
        updatedRequest.status === 'READY_FOR_DISBURSAL'
      ) {
        return updatedRequest;
      }
      throw new BadRequestException('Only submitted requests can be approved');
    }

    await this.writeAuditLog({
      userId,
      action: 'SALARY_REQUEST_APPROVED',
      entityType: 'SALARY_REQUEST',
      entityId: updatedRequest.id,
      oldValue: this.salaryRequestAuditValue(request),
      newValue: this.salaryRequestAuditValue(updatedRequest),
    });

    if (membershipActive) {
      // Membership active → READY_FOR_DISBURSAL
      if (request.employee.userId) {
        await this.notificationsService.createSystemNotification(
          request.employee.userId,
          'Salary Request Approved',
          'Your salary advance request has been approved and is ready for disbursal.',
        );
      }

      const admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true },
      });

      await Promise.all(
        admins.map((admin) =>
          this.notificationsService.createSystemNotification(
            admin.id,
            'Salary Request Ready for Disbursal',
            `A salary advance request from ${request.employee.name} has been approved by the employer and is ready for disbursal.`,
          ),
        ),
      );

      try {
        await this.emailService.sendSalaryRequestApprovedEmail({
          to: request.employee.email,
          employeeName: request.employee.name,
          amount: Number(
            updatedRequest.approvedAmount ?? updatedRequest.amount,
          ),
          approvedDate: new Date(),
        });
      } catch (error) {
        console.error('Failed to send salary request approved email', error);
      }
    } else {
      // No membership → AWAITING_MEMBERSHIP_PAYMENT
      if (request.employee.userId) {
        await this.notificationsService.createSystemNotification(
          request.employee.userId,
          'Action Required: Complete Membership Payment',
          'Your salary advance request has been approved by your employer. Please complete your MobPae membership payment to proceed with disbursal.',
        );
      }

      try {
        await this.emailService.sendAwaitingMembershipPaymentEmail({
          to: request.employee.email,
          employeeName: request.employee.name,
          amount: Number(
            updatedRequest.approvedAmount ?? updatedRequest.amount,
          ),
          approvedDate: new Date(),
        });
      } catch (error) {
        console.error(
          'Failed to send awaiting membership payment email',
          error,
        );
      }
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

    if (request.status === 'EMPLOYER_REJECTED') {
      return request;
    }

    if (request.status !== 'SUBMITTED') {
      throw new BadRequestException('Only submitted requests can be rejected');
    }

    const transition = await this.prisma.salaryRequest.updateMany({
      where: {
        id,
        status: 'SUBMITTED',
      },

      data: {
        status: 'EMPLOYER_REJECTED',

        remarks,
      },
    });

    const updatedRequest = await this.prisma.salaryRequest.findUnique({
      where: { id },
    });

    if (!updatedRequest) {
      throw new NotFoundException('Salary request not found');
    }

    if (transition.count === 0) {
      if (updatedRequest.status === 'EMPLOYER_REJECTED') {
        return updatedRequest;
      }

      throw new BadRequestException('Only submitted requests can be rejected');
    }

    await this.writeAuditLog({
      userId,
      action: 'SALARY_REQUEST_REJECTED',
      entityType: 'SALARY_REQUEST',
      entityId: updatedRequest.id,
      oldValue: this.salaryRequestAuditValue(request),
      newValue: this.salaryRequestAuditValue(updatedRequest),
    });

    if (request.employee.userId) {
      await this.notificationsService.createSystemNotification(
        request.employee.userId,

        'Salary Request Rejected',

        remarks || 'Your salary advance request has been rejected.',
      );
    }

    try {
      await this.emailService.sendSalaryRequestRejectedEmail({
        to: request.employee.email,
        employeeName: request.employee.name,
        amount: Number(request.amount),
        requestDate: request.requestedAt,
        remarks: remarks || 'No reason provided.',
      });
    } catch (err) {
      console.error('Failed to send salary request rejected email', err);
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

    const requestDate = new Date();
    const payrollCutoffDate = employee.employer.payrollCutoffDate;
    const payrollDate = employee.employer.payrollDate;

    const repayment = PayrollUtil.calculateRepayment(
      amount,
      requestDate,
      payrollCutoffDate,
      payrollDate,
      annualInterestRate,
    );
    const isNextCycleRecovery = requestDate.getDate() >= payrollCutoffDate;
    const cycleMessage = isNextCycleRecovery
      ? 'Payroll cutoff has passed. This advance will be recovered in the next salary cycle.'
      : 'This advance will be recovered in the current salary cycle.';

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
      payrollDate,
      payrollCutoffDate,
      isNextCycleRecovery,
      cycleMessage,
      nextEligibleAfter: repayment.dueDate,

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
  async findOne(
    id: string,
    actor?: {
      role?: string;
      userId?: string;
    },
  ) {
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

    if (actor?.role === 'EMPLOYER') {
      const employer = await this.prisma.employer.findUnique({
        where: {
          userId: actor.userId,
        },
      });

      if (!employer || salaryRequest.employerId !== employer.id) {
        throw new ForbiddenException('You can only access your own requests');
      }
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

      case 'AWAITING_MEMBERSHIP_PAYMENT':
        return 'Awaiting Membership Payment';

      case 'READY_FOR_DISBURSAL':
        return 'Ready for Disbursal';

      case 'DISBURSED':
        return 'Disbursed';

      case 'REPAYMENT_SCHEDULED':
        return 'Payment Scheduled';

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

      case 'AWAITING_MEMBERSHIP_PAYMENT':
        return 'warning';

      case 'READY_FOR_DISBURSAL':
        return 'info';

      case 'DISBURSED':
        return 'primary';

      case 'REPAYMENT_SCHEDULED':
        return 'info';

      case 'REPAID':
        return 'success';

      case 'EMPLOYER_REJECTED':
        return 'danger';

      default:
        return 'default';
    }
  }

  private salaryRequestAuditValue(request: {
    id: string;
    employeeId: string;
    employerId: string;
    amount: unknown;
    approvedAmount?: unknown;
    status: string;
    remarks?: string | null;
    requestedAt?: Date;
  }) {
    return {
      id: request.id,
      employeeId: request.employeeId,
      employerId: request.employerId,
      amount: Number(request.amount),
      approvedAmount:
        request.approvedAmount === null || request.approvedAmount === undefined
          ? null
          : Number(request.approvedAmount),
      status: request.status,
      remarks: request.remarks ?? null,
      requestedAt: request.requestedAt?.toISOString(),
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
}
