import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { UpdatePayrollSettingsDto } from './dto/update-payroll-settings.dto';

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new BadRequestException('Employer not found');
    }

    const employeesDue = await this.prisma.repayment.count({
      where: {
        status: 'SCHEDULED',
        salaryRequest: {
          employee: {
            employerId: employer.id,
          },
        },
      },
    });

    const pendingRecoveries = await this.prisma.repayment.count({
      where: {
        status: 'SCHEDULED',
        salaryRequest: {
          employee: {
            employerId: employer.id,
          },
        },
      },
    });

    const completedRecoveries = await this.prisma.repayment.count({
      where: {
        status: 'PAID',
        salaryRequest: {
          employee: {
            employerId: employer.id,
          },
        },
      },
    });

    const repayments = await this.prisma.repayment.findMany({
      where: {
        status: 'SCHEDULED',
        salaryRequest: {
          employee: {
            employerId: employer.id,
          },
        },
      },
    });

    const totalRecoveryAmount = repayments.reduce(
      (sum, repayment) => sum + Number(repayment.amount),
      0,
    );

    return {
      payrollDate: employer.payrollDate,
      cutoffDate: employer.payrollCutoffDate,
      employeesDue,
      pendingRecoveries,
      completedRecoveries,
      totalRecoveryAmount,
    };
  }

  async getRecoveries(userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new BadRequestException('Employer not found');
    }

    return this.prisma.repayment.findMany({
      where: {
        salaryRequest: {
          employee: {
            employerId: employer.id,
          },
        },
      },
      include: {
        salaryRequest: {
          include: {
            employee: true,
          },
        },
      },
      orderBy: {
        dueDate: 'asc',
      },
    });
  }

  async updateSettings(userId: string, dto: UpdatePayrollSettingsDto) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new BadRequestException('Employer not found');
    }

    return this.prisma.employer.update({
      where: {
        id: employer.id,
      },
      data: {
        payrollDate: dto.payrollDate,
        payrollCutoffDate: dto.payrollCutoffDate,
      },
    });
  }
}
