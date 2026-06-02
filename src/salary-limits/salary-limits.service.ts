import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateSalaryLimitDto } from './dto/create-salary-limit.dto';

@Injectable()
export class SalaryLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a salary limit for an employee.
   * Validation Flow:
   * 1. Employee must have completed KYC:
   *    - PAN verified
   *    - AADHAR verified
   *    - Salary Slip verified
   * 2. Employee must not already have a salary limit assigned.
   * 3. Employee must have a bank account registered.
   * 4. Employee bank account must be verified by Admin.
   * Only after all validations pass, a salary limit record is created for the employee.
   */

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

    const existingLimit = await this.prisma.salaryLimit.findUnique({
      where: {
        employeeId: dto.employeeId,
      },
    });

    if (existingLimit) {
      throw new BadRequestException('Salary limit already assigned');
    }

    const bankAccount = await this.prisma.employeeBankAccount.findUnique({
      where: {
        employeeId: dto.employeeId,
      },
    });

    if (!bankAccount) {
      throw new BadRequestException('Employee bank account not found');
    }

    if (!bankAccount.verified) {
      throw new BadRequestException('Employee bank account is not verified');
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
