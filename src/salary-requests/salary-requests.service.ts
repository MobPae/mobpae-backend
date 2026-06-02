import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateSalaryRequestDto } from './dto/create-salary-request.dto';

@Injectable()
export class SalaryRequestsService {
  constructor(private readonly prisma: PrismaService) {}

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
