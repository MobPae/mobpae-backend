/**
 * @deprecated This module has been renamed to LoanLimits.
 * SalaryLimitsService is a thin wrapper that delegates to prisma.loanLimit.
 * It will be replaced by a dedicated loan-limits module in Phase A cleanup.
 */
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
   * Creates a loan limit for an employee (renamed from salary limit).
   * Validation:
   * 1. Employee must have PAN, AADHAR, SALARY_SLIP all VERIFIED.
   * 2. No existing loan limit.
   * 3. Employee must have a verified bank account.
   */
  async create(dto: CreateSalaryLimitDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    const verifiedDocs = await this.prisma.kycDocument.findMany({
      where: { employeeId: dto.employeeId, status: 'VERIFIED' },
    });

    const pan = verifiedDocs.some((doc) => doc.documentType === 'PAN');
    const aadhar = verifiedDocs.some((doc) => doc.documentType === 'AADHAR');
    const salarySlip = verifiedDocs.some(
      (doc) => doc.documentType === 'SALARY_SLIP',
    );

    if (!(pan && aadhar && salarySlip)) {
      throw new BadRequestException('Employee KYC is not completed');
    }

    const existingLimit = await this.prisma.loanLimit.findUnique({
      where: { employeeId: dto.employeeId },
    });

    if (existingLimit) {
      throw new BadRequestException('Loan limit already assigned');
    }

    const bankAccount = await this.prisma.employeeBankAccount.findUnique({
      where: { employeeId: dto.employeeId },
    });

    if (!bankAccount) {
      throw new BadRequestException('Employee bank account not found');
    }

    if (!bankAccount.verified) {
      throw new BadRequestException('Employee bank account is not verified');
    }

    const loanLimit = await this.prisma.loanLimit.create({
      data: {
        employeeId: dto.employeeId,
        maximumEligibleAmount: dto.approvedLimit,
        maxRequestsPerCycle: dto.maxRequestsPerCycle,
        cooldownDays: dto.cooldownDays,
      },
    });

    if (employee.userId) {
      await this.notificationsService.createSystemNotification(
        employee.userId,
        'Loan Limit Assigned',
        `Your salary advance limit of ₹${dto.approvedLimit} has been approved.`,
      );
    }

    return loanLimit;
  }

  async findByEmployee(employeeId: string) {
    return this.prisma.loanLimit.findUnique({ where: { employeeId } });
  }
}
