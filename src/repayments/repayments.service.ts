import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { RepaymentListQueryDto } from './dto/repayment-list-query.dto';

@Injectable()
export class RepaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
  ) {}

  async findByEmployee(employeeId: string) {
    const repayments = await this.prisma.repayment.findMany({
      where: { loanApplication: { employeeId } },
      include: { loanApplication: true },
      orderBy: { createdAt: 'desc' },
    });

    return repayments.map((r) => ({
      id: r.id,
      loanApplicationId: r.loanApplicationId,
      applicationNumber: r.loanApplication.applicationNumber,
      principalAmount: Number(r.principalAmount),
      interestFreeAmount: Number(r.interestFreeAmount),
      interestBearingAmount: Number(r.interestBearingAmount),
      interestAmount: Number(r.interestAmount),
      processingFee: Number(r.processingFee),
      gstAmount: Number(r.gstAmount),
      totalAmount: Number(r.totalAmount),
      interestDays: r.interestDays,
      dueDate: r.dueDate,
      status: r.status,
    }));
  }

  /**
   * Marks repayment as completed.
   *
   * Flow:
   * 1. Validate repayment exists.
   * 2. Mark PAID.
   * 3. Transition LoanApplication → REPAID.
   * 4. Notify employee.
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
          where: { id, status: { not: 'PAID' } },
          data: { status: 'PAID', paidDate: new Date() },
        });

        const repayment = await tx.repayment.findUnique({ where: { id } });

        if (!repayment) {
          throw new NotFoundException('Repayment not found');
        }

        if (claim.count === 0) {
          return { repayment, transitioned: false };
        }

        const loanApplication = await tx.loanApplication.findUnique({
          where: { id: repayment.loanApplicationId },
          select: { status: true },
        });

        await tx.loanApplication.update({
          where: { id: repayment.loanApplicationId },
          data: { status: 'REPAID' },
        });

        await tx.loanApplicationHistory.create({
          data: {
            loanApplicationId: repayment.loanApplicationId,
            previousStatus: loanApplication?.status ?? null,
            newStatus: 'REPAID',
            changedBy: null,
            actorRole: 'SYSTEM',
            remarks: 'Repayment marked as paid',
          },
        });

        return { repayment, transitioned: true };
      },
    );

    if (!transitioned) {
      return repayment;
    }

    const loanApplication = await this.prisma.loanApplication.findUnique({
      where: { id: repayment.loanApplicationId },
      include: { employee: true },
    });

    if (loanApplication?.employee.userId) {
      await this.notificationsService.createSystemNotification(
        loanApplication.employee.userId,
        'Repayment Completed',
        'Your salary advance repayment has been completed successfully.',
      );
    }

    if (loanApplication?.employee) {
      try {
        await this.emailService.sendRepaymentPaidEmail({
          to: loanApplication.employee.email,
          employeeName: loanApplication.employee.name,
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
        loanApplication: {
          include: {
            employee: {
              include: { employer: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllForEmployer(userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: { userId },
    });

    if (!employer) {
      throw new BadRequestException('Employer not found');
    }

    const repayments = await this.prisma.repayment.findMany({
      where: {
        loanApplication: {
          employee: { employerId: employer.id },
        },
      },
      include: {
        loanApplication: {
          include: { employee: true },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    return repayments.map((r) => ({
      id: r.id,
      principalAmount: r.principalAmount,
      interestAmount: r.interestAmount,
      totalAmount: r.totalAmount,
      dueDate: r.dueDate,
      status: r.status,
      employee: {
        id: r.loanApplication.employee.id,
        employeeCode: r.loanApplication.employee.employeeCode,
        name: r.loanApplication.employee.name,
      },
      loanApplication: {
        id: r.loanApplication.id,
        applicationNumber: r.loanApplication.applicationNumber,
      },
    }));
  }

  async findByUserId(userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.findByEmployee(employee.id);
  }
}
