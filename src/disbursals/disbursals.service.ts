import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateDisbursalDto } from './dto/create-disbursal.dto';

@Injectable()
export class DisbursalsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.disbursal.create({
      data: {
        salaryRequestId: salaryRequest.id,
        amount: salaryRequest.amount,
      },
    });
  }

  async findAll() {
    return this.prisma.disbursal.findMany({
      include: {
        salaryRequest: true,
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
   *
   * Result:
   * Employee receives advance salary.
   */

  async disburse(id: string) {
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

    return disbursal;
  }
}
