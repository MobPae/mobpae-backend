import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateSalaryLimitDto } from './dto/create-salary-limit.dto';

@Injectable()
export class SalaryLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSalaryLimitDto) {
    const verifiedDocs = await this.prisma.kycDocument.findMany({
      where: {
        employeeId: dto.employeeId,
        status: 'VERIFIED',
      },
    });

    const pan = verifiedDocs.some((doc) => doc.documentType === 'PAN');

    const aadhar = verifiedDocs.some((doc) => doc.documentType === 'AADHAR');

    const salarySlip = verifiedDocs.some(
      (doc) => doc.documentType === 'SALARY_SLIP',
    );

    if (!(pan && aadhar && salarySlip)) {
      throw new BadRequestException('Employee KYC is not completed');
    }

    return this.prisma.salaryLimit.create({
      data: {
        employeeId: dto.employeeId,
        approvedLimit: dto.approvedLimit,
        maxRequestsPerCycle: dto.maxRequestsPerCycle,
        cooldownDays: dto.cooldownDays,
      },
    });
  }

  async findByEmployee(employeeId: string) {
    return this.prisma.salaryLimit.findUnique({
      where: {
        employeeId,
      },
    });
  }
}
