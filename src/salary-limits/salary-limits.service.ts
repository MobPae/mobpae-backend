import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

import { CreateSalaryLimitDto } from './dto/create-salary-limit.dto';

@Injectable()
export class SalaryLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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
    const employee = await this.prisma.employee.findUnique({
      where: {
        id: dto.employeeId,
      },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

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

    if (
      !(pan && aadhar && salarySlip && employee.selfieStatus === 'VERIFIED')
    ) {
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

    const salaryLimit = await this.prisma.salaryLimit.create({
      data: {
        employeeId: dto.employeeId,
        approvedLimit: dto.approvedLimit,
        maxRequestsPerCycle: dto.maxRequestsPerCycle,
        cooldownDays: dto.cooldownDays,
      },
    });

    if (employee?.userId) {
      await this.notificationsService.createSystemNotification(
        employee.userId,
        'Salary Limit Assigned',
        `Your salary advance limit of ₹${dto.approvedLimit} has been approved.`,
      );
    }

    return salaryLimit;
  }

  /**
   * Retrieves salary limit details for an employee.
   */
  async findByEmployee(employeeId: string) {
    return this.prisma.salaryLimit.findUnique({
      where: {
        employeeId,
      },
    });
  }
}
