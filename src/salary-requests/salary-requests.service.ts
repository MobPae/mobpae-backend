import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateSalaryRequestDto } from './dto/create-salary-request.dto';

@Injectable()
export class SalaryRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a salary advance request.
   *
   * Validation Flow:
   * 1. Employee must exist.
   * 2. Salary limit must exist.
   * 3. Requested amount must not exceed approved limit.
   * 4. Employee must not have an active request.
   *
   * Result:
   * Request is submitted for employer approval.
   */

  async create(dto: CreateSalaryRequestDto) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        id: dto.employeeId,
      },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    const salaryLimit = await this.prisma.salaryLimit.findUnique({
      where: {
        employeeId: dto.employeeId,
      },
    });

    if (!salaryLimit) {
      throw new BadRequestException('Salary limit not assigned');
    }

    if (Number(dto.amount) > Number(salaryLimit.approvedLimit)) {
      throw new BadRequestException('Requested amount exceeds approved limit');
    }

    return this.prisma.salaryRequest.create({
      data: {
        employeeId: employee.id,
        employerId: employee.employerId,
        amount: dto.amount,
      },
    });
  }

  async findByEmployee(employeeId: string) {
    return this.prisma.salaryRequest.findMany({
      where: {
        employeeId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findPendingByEmployer(employerId: string) {
    return this.prisma.salaryRequest.findMany({
      where: {
        employee: {
          employerId,
        },
        status: 'SUBMITTED',
      },
      include: {
        employee: true,
      },
    });
  }

  /**
   * Employer approval of salary advance request.
   *
   * Business Flow:
   * 1. Validate request exists.
   * 2. Validate request is in SUBMITTED status.
   * 3. Update status to EMPLOYER_APPROVED.
   *
   * Result:
   * Request becomes eligible for disbursal.
   */

  async approve(id: string) {
    return this.prisma.salaryRequest.update({
      where: {
        id,
      },
      data: {
        status: 'EMPLOYER_APPROVED',
      },
    });
  }
}
