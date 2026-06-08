import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRepaymentDto } from './dto/create-repayment.dto';
import { NotificationsService } from '../notifications/notifications.service';

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
    });

    if (!salaryRequest) {
      throw new BadRequestException('Salary request not found');
    }

    if (salaryRequest.status !== 'DISBURSED') {
      throw new BadRequestException('Salary request is not disbursed');
    }

    return this.prisma.repayment.create({
      data: {
        salaryRequestId: salaryRequest.id,
        amount: salaryRequest.amount,
        dueDate: new Date(dto.dueDate),
      },
    });
  }

  async findByEmployee(employeeId: string) {
    return this.prisma.repayment.findMany({
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

    return this.prisma.repayment.findMany({
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
  }
}
