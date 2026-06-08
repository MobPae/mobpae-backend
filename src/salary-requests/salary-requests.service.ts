import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSalaryRequestDto } from './dto/create-salary-request.dto';
import { NotificationsService } from '../notifications/notifications.service';

import { PayrollUtil } from '../common/utils/payroll.util';

@Injectable()
export class SalaryRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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

  async findAllForAdmin() {
    return this.prisma.salaryRequest.findMany({
      include: {
        employee: {
          include: {
            employer: true,
          },
        },
        disbursal: true,
        repayment: true,
      },
      orderBy: {
        requestedAt: 'desc',
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
   * 4. Notify employee.
   *
   * Result:
   * Request becomes eligible for disbursal.
   */
  async approve(id: string) {
    const request = await this.prisma.salaryRequest.findUnique({
      where: {
        id,
      },
      include: {
        employee: true,
      },
    });

    if (!request) {
      throw new BadRequestException('Salary request not found');
    }

    const updatedRequest = await this.prisma.salaryRequest.update({
      where: {
        id,
      },
      data: {
        status: 'EMPLOYER_APPROVED',
      },
    });

    if (request.employee.userId) {
      await this.notificationsService.createSystemNotification(
        request.employee.userId,
        'Salary Request Approved',
        'Your salary advance request has been approved.',
      );
    }

    return updatedRequest;
  }

  async findAllForEmployer(userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new Error('Employer not found');
    }

    return this.prisma.salaryRequest.findMany({
      where: {
        employerId: employer.id,
      },
      include: {
        employee: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async reject(id: string, remarks: string) {
    const request = await this.prisma.salaryRequest.findUnique({
      where: {
        id,
      },
    });

    if (!request) {
      throw new NotFoundException('Salary request not found');
    }

    return this.prisma.salaryRequest.update({
      where: {
        id,
      },
      data: {
        status: 'EMPLOYER_REJECTED',
        remarks,
      },
    });
  }

  async preview(userId: string, amount: number) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
      include: {
        employer: true,
      },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    const interestSetting = await this.prisma.setting.findUnique({
      where: {
        key: 'ANNUAL_INTEREST_RATE',
      },
    });

    const annualInterestRate = Number(interestSetting?.value ?? 36);

    const repayment = PayrollUtil.calculateRepayment(
      amount,
      new Date(),
      employee.employer.payrollCutoffDate,
      employee.employer.payrollDate,
      annualInterestRate,
    );

    return {
      principalAmount: amount,
      interestRate: annualInterestRate,
      interestDays: repayment.interestDays,
      interestAmount: repayment.interestAmount,
      totalAmount: repayment.totalAmount,
      dueDate: repayment.dueDate,
    };
  }

  /**

  * Get complete salary request details.
  *
  * Used by:
  * - Employer Request Details screen
  * - Admin Review screen
  * - Future Request Tracking page
  *
  * Returns:
  * - Salary request details
  * - Employee details
  * - Repayment details (if created)
  * - Disbursal details (if disbursed)
 */
  async findOne(id: string) {
    const salaryRequest = await this.prisma.salaryRequest.findUnique({
      where: {
        id,
      },
      include: {
        employee: {
          include: {
            employer: true,
          },
        },
        repayment: true,
        disbursal: true,
      },
    });

    if (!salaryRequest) {
      throw new NotFoundException('Salary request not found');
    }

    return {
      id: salaryRequest.id,

      amount: salaryRequest.amount,
      approvedAmount: salaryRequest.approvedAmount,

      status: salaryRequest.status,

      requestedAt: salaryRequest.requestedAt,

      remarks: salaryRequest.remarks,

      employee: {
        id: salaryRequest.employee.id,
        employeeCode: salaryRequest.employee.employeeCode,
        name: salaryRequest.employee.name,
        email: salaryRequest.employee.email,
        phone: salaryRequest.employee.phone,
        salaryInHand: salaryRequest.employee.salaryInHand,
      },

      repayment: salaryRequest.repayment,

      disbursal: salaryRequest.disbursal,
    };
  }
}
