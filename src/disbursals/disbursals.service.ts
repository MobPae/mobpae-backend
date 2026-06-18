import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDisbursalDto } from './dto/create-disbursal.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PayrollUtil } from 'src/common/utils/payroll.util';
import { EmailService } from '../email/email.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SettingsPolicyService } from '../settings/settings-policy.service';

@Injectable()
export class DisbursalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
    private readonly auditLogsService: AuditLogsService,
    private readonly settingsPolicy: SettingsPolicyService,
  ) {}

  async create(dto: CreateDisbursalDto, actorUserId: string) {
    const salaryRequest = await this.prisma.salaryRequest.findUnique({
      where: {
        id: dto.salaryRequestId,
      },
    });

    if (!salaryRequest) {
      throw new BadRequestException('Salary request not found');
    }

    const employer = await this.prisma.employer.findUnique({
      where: {
        id: salaryRequest.employerId,
      },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    if (employer.riskStatus === 'BLOCKED') {
      throw new BadRequestException(
        'Employer has overdue settlements. Please clear outstanding dues before further disbursals.',
      );
    }

    if (salaryRequest.status !== 'EMPLOYER_APPROVED') {
      throw new BadRequestException('Salary request is not approved');
    }

    const existingDisbursal = await this.prisma.disbursal.findUnique({
      where: {
        salaryRequestId: salaryRequest.id,
      },
    });

    const disbursal = await this.prisma.disbursal.upsert({
      where: {
        salaryRequestId: salaryRequest.id,
      },
      update: {},
      create: {
        salaryRequestId: salaryRequest.id,
        amount: salaryRequest.approvedAmount ?? salaryRequest.amount,
      },
    });

    await this.prisma.salaryRequest.update({
      where: {
        id: salaryRequest.id,
      },
      data: {
        status: 'READY_FOR_DISBURSAL',
        approvedAmount: salaryRequest.approvedAmount ?? salaryRequest.amount,
      },
    });

    if (!existingDisbursal) {
      await this.writeAuditLog({
        userId: actorUserId,
        action: 'DISBURSAL_CREATED',
        entityType: 'DISBURSAL',
        entityId: disbursal.id,
        oldValue: null,
        newValue: this.disbursalAuditValue(disbursal),
      });
    }

    return disbursal;
  }

  async findAllForAdmin() {
    return this.prisma.disbursal.findMany({
      include: {
        salaryRequest: {
          include: {
            employee: {
              include: {
                employer: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Marks a salary advance as disbursed.
   *
   * Business Flow:
   * 1. Validate disbursal exists.
   * 2. Validate status is PENDING.
   * 3. Validate employer is not BLOCKED.
   * 4. Mark disbursal as DISBURSED.
   * 5. Update salary request status.
   * 6. Notify employee.
   *
   * Result:
   * Employee receives advance salary.
   */

  async disburse(id: string, actorUserId: string) {
    const existingDisbursal = await this.prisma.disbursal.findUnique({
      where: {
        id,
      },
    });

    if (!existingDisbursal) {
      throw new NotFoundException('Disbursal not found');
    }

    if (existingDisbursal.status !== 'PENDING') {
      throw new BadRequestException('Disbursal is not pending');
    }

    const salaryRequest = await this.prisma.salaryRequest.findUnique({
      where: {
        id: existingDisbursal.salaryRequestId,
      },
      include: {
        employee: true,
        employer: true,
      },
    });

    if (!salaryRequest) {
      throw new NotFoundException('Salary request not found');
    }

    if (salaryRequest.employer.riskStatus === 'BLOCKED') {
      throw new BadRequestException(
        'Employer has overdue settlements. Please clear outstanding dues before further disbursals.',
      );
    }

    let repayment = await this.prisma.repayment.findUnique({
      where: {
        salaryRequestId: salaryRequest.id,
      },
    });

    let repaymentCreated = false;

    if (!repayment) {
      const annualInterestRate =
        await this.settingsPolicy.getAnnualInterestRate();

      const approvedAmount = Number(
        salaryRequest.approvedAmount ?? salaryRequest.amount,
      );

      const repaymentCalculation = PayrollUtil.calculateRepayment(
        approvedAmount,
        salaryRequest.requestedAt,
        salaryRequest.employer.payrollCutoffDate,
        salaryRequest.employer.payrollDate,
        annualInterestRate,
      );

      repayment = await this.prisma.repayment.create({
        data: {
          salaryRequestId: salaryRequest.id,
          principalAmount: approvedAmount,
          interestAmount: repaymentCalculation.interestAmount,
          totalAmount: repaymentCalculation.totalAmount,
          interestRate: annualInterestRate,
          interestDays: repaymentCalculation.interestDays,
          dueDate: repaymentCalculation.dueDate,
          status: 'SCHEDULED',
        },
      });

      repaymentCreated = true;
    }

    const disbursal = await this.prisma.disbursal.update({
      where: {
        id,
      },
      data: {
        status: 'DISBURSED',
        disbursedAt: new Date(),
      },
    });

    await this.prisma.salaryRequest.update({
      where: {
        id: disbursal.salaryRequestId,
      },
      data: {
        status: 'DISBURSED',
      },
    });

    if (salaryRequest.employee.userId) {
      await this.notificationsService.createSystemNotification(
        salaryRequest.employee.userId,
        'Salary Disbursed',
        `₹${disbursal.amount} has been disbursed to your registered bank account.`,
      );
    }

    if (repaymentCreated && repayment) {
      await this.writeAuditLog({
        userId: actorUserId,
        action: 'REPAYMENT_CREATED',
        entityType: 'REPAYMENT',
        entityId: repayment.id,
        oldValue: null,
        newValue: this.repaymentAuditValue(repayment),
      });
    }

    try {
      await this.emailService.sendDisbursalSuccessfulEmail({
        to: salaryRequest.employee.email,
        employeeName: salaryRequest.employee.name,
        disbursedAmount: Number(disbursal.amount),
        disbursalDate: disbursal.disbursedAt ?? new Date(),
        repaymentDate: repayment?.dueDate,
      });
    } catch (error) {
      console.error('Failed to send disbursal successful email', error);
    }

    return disbursal;
  }

  private disbursalAuditValue(disbursal: {
    id: string;
    salaryRequestId: string;
    amount: unknown;
    status: string;
    disbursedAt?: Date | null;
  }) {
    return {
      id: disbursal.id,
      salaryRequestId: disbursal.salaryRequestId,
      amount: Number(disbursal.amount),
      status: disbursal.status,
      disbursedAt: disbursal.disbursedAt?.toISOString() ?? null,
    };
  }

  private repaymentAuditValue(repayment: {
    id: string;
    salaryRequestId: string;
    principalAmount: unknown;
    interestAmount: unknown;
    totalAmount: unknown;
    interestRate: unknown;
    interestDays: number;
    dueDate: Date;
    status: string;
  }) {
    return {
      id: repayment.id,
      salaryRequestId: repayment.salaryRequestId,
      principalAmount: Number(repayment.principalAmount),
      interestAmount: Number(repayment.interestAmount),
      totalAmount: Number(repayment.totalAmount),
      interestRate: Number(repayment.interestRate),
      interestDays: repayment.interestDays,
      dueDate: repayment.dueDate.toISOString(),
      status: repayment.status,
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
