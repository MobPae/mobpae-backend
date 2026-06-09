import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDisbursalDto } from './dto/create-disbursal.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DisbursalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
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
   * 3. Mark disbursal as DISBURSED.
   * 4. Update salary request status.
   * 5. Notify employee.
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

    const salaryRequest = await this.prisma.salaryRequest.findUnique({
      where: {
        id: disbursal.salaryRequestId,
      },
      include: {
        employee: true,
      },
    });

    if (salaryRequest?.employee.userId) {
      await this.notificationsService.createSystemNotification(
        salaryRequest.employee.userId,
        'Salary Disbursed',
        `₹${disbursal.amount} has been disbursed to your registered bank account.`,
      );
    }

    return disbursal;
  }
}
