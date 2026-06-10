import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRepaymentDto } from './dto/create-repayment.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PayrollUtil } from '../common/utils/payroll.util';

@Injectable()
export class RepaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
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
    const repayment = await this.prisma.repayment.update({
      where: {
        id,
      },
      data: {
        status: 'PAID',
        paidDate: new Date(),
      },
    });

    await this.prisma.salaryRequest.update({
      where: {
        id: repayment.salaryRequestId,
      },
      data: {
        status: 'REPAID',
      },
    });

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

    return repayment;
  }

  async findAllForAdmin() {
    return this.prisma.repayment.findMany({
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
