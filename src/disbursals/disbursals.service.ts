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

@Injectable()
export class DisbursalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
  ) {}

  async create(dto: CreateDisbursalDto) {
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

  async disburse(id: string) {
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

    if (!repayment) {
      const interestSetting = await this.prisma.setting.findUnique({
        where: {
          key: 'ANNUAL_INTEREST_RATE',
        },
      });

      const annualInterestRate = Number(interestSetting?.value ?? 36);

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
}
