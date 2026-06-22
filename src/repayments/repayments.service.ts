import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRepaymentDto } from './dto/create-repayment.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { PayrollUtil } from '../common/utils/payroll.util';
import { SettingsPolicyService } from '../settings/settings-policy.service';
import { RepaymentListQueryDto } from './dto/repayment-list-query.dto';

@Injectable()
export class RepaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
    private readonly settingsPolicy: SettingsPolicyService,
  ) {}

  async create(dto: CreateRepaymentDto) {
    const salaryRequest = await this.prisma.salaryRequest.findUnique({
      where: {
        id: dto.salaryRequestId,
      },
      include: {
        employer: true,
      },
    });

    if (!salaryRequest) {
      throw new BadRequestException('Salary request not found');
    }

    const existingRepayment = await this.prisma.repayment.findUnique({
      where: {
        salaryRequestId: salaryRequest.id,
      },
    });

    if (existingRepayment) {
      throw new BadRequestException('Repayment already exists');
    }

    if (salaryRequest.status !== 'DISBURSED') {
      throw new BadRequestException('Salary request is not disbursed');
    }

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

    return this.prisma.repayment.create({
      data: {
        salaryRequestId: salaryRequest.id,
        principalAmount: approvedAmount,
        interestAmount: repaymentCalculation.interestAmount,
        totalAmount: repaymentCalculation.totalAmount,
        interestRate: annualInterestRate,
        interestDays: repaymentCalculation.interestDays,
        dueDate: repaymentCalculation.dueDate,
      },
    });
  }

  async findByEmployee(employeeId: string) {
    const repayments = await this.prisma.repayment.findMany({
      where: {
        salaryRequest: {
          employeeId,
        },
      },
      include: {
        salaryRequest: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return repayments.map((repayment) => ({
      id: repayment.id,

      salaryRequestId: repayment.salaryRequestId,

      principalAmount: Number(repayment.principalAmount),

      interestAmount: Number(repayment.interestAmount),

      totalAmount: Number(repayment.totalAmount),

      interestDays: repayment.interestDays,

      dueDate: repayment.dueDate,

      status: repayment.status,
    }));
  }

  /**
   * Marks repayment as completed.
   *
   * Business Flow:
   * 1. Validate repayment exists.
   * 2. Mark repayment as PAID.
   * 3. Update salary request status to REPAID.
   * 4. Notify employee.
   *
   * Result:
   * Employee becomes eligible for future requests.
   */
  async pay(id: string) {
    const existingRepayment = await this.prisma.repayment.findUnique({
      where: { id },
    });

    if (!existingRepayment) {
      throw new NotFoundException('Repayment not found');
    }

    if (existingRepayment.status === 'PAID') {
      return existingRepayment;
    }

    const { repayment, transitioned } = await this.prisma.$transaction(
      async (tx) => {
        const claim = await tx.repayment.updateMany({
          where: {
            id,
            status: {
              not: 'PAID',
            },
          },
          data: {
            status: 'PAID',
            paidDate: new Date(),
          },
        });

        const repayment = await tx.repayment.findUnique({
          where: { id },
        });

        if (!repayment) {
          throw new NotFoundException('Repayment not found');
        }

        if (claim.count === 0) {
          return { repayment, transitioned: false };
        }

        await tx.salaryRequest.update({
          where: {
            id: repayment.salaryRequestId,
          },
          data: {
            status: 'REPAID',
          },
        });

        return { repayment, transitioned: true };
      },
    );

    if (!transitioned) {
      return repayment;
    }

    const salaryRequest = await this.prisma.salaryRequest.findUnique({
      where: {
        id: repayment.salaryRequestId,
      },
      include: {
        employee: true,
      },
    });

    if (salaryRequest?.employee.userId) {
      await this.notificationsService.createSystemNotification(
        salaryRequest.employee.userId,
        'Repayment Completed',
        'Your salary advance repayment has been completed successfully.',
      );
    }

    if (salaryRequest?.employee) {
      try {
        await this.emailService.sendRepaymentPaidEmail({
          to: salaryRequest.employee.email,
          employeeName: salaryRequest.employee.name,
          totalAmount: Number(repayment.totalAmount),
          paidDate: repayment.paidDate ?? new Date(),
        });
      } catch (err) {
        console.error('Failed to send repayment paid email', err);
      }
    }

    return repayment;
  }

  async findAllForAdmin(query: RepaymentListQueryDto = {}) {
    return this.prisma.repayment.findMany({
      where: {
        status: query.status,
        dueDate:
          query.startDate || query.endDate
            ? {
                gte: query.startDate ? new Date(query.startDate) : undefined,
                lte: query.endDate ? new Date(query.endDate) : undefined,
              }
            : undefined,
      },
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

  async findAllForEmployer(userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new BadRequestException('Employer not found');
    }

    const repayments = await this.prisma.repayment.findMany({
      where: {
        salaryRequest: {
          employee: {
            employerId: employer.id,
          },
        },
      },
      include: {
        salaryRequest: {
          include: {
            employee: true,
          },
        },
      },
      orderBy: {
        dueDate: 'asc',
      },
    });

    return repayments.map((repayment) => ({
      id: repayment.id,

      principalAmount: repayment.principalAmount,
      interestAmount: repayment.interestAmount,
      totalAmount: repayment.totalAmount,

      dueDate: repayment.dueDate,
      status: repayment.status,

      employee: {
        id: repayment.salaryRequest.employee.id,
        employeeCode: repayment.salaryRequest.employee.employeeCode,
        name: repayment.salaryRequest.employee.name,
      },

      salaryRequest: {
        id: repayment.salaryRequest.id,
      },
    }));
  }

  async findByUserId(userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.findByEmployee(employee.id);
  }
}
