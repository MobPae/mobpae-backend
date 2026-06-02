import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateRepaymentDto } from './dto/create-repayment.dto';

@Injectable()
export class RepaymentsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return repayment;
  }
}
