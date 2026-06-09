import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

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
      (sum, repayment) => sum + Number(repayment.totalAmount),
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

  async processRecovery(employerId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        id: employerId,
      },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    const today = new Date();

    const payrollMonth = `${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, '0')}`;

    const existingSettlement = await this.prisma.employerSettlement.findUnique({
      where: {
        employerId_payrollMonth: {
          employerId,
          payrollMonth,
        },
      },
    });

    if (existingSettlement) {
      throw new BadRequestException(
        `Settlement already generated for ${payrollMonth}`,
      );
    }

    const repayments = await this.prisma.repayment.findMany({
      where: {
        status: 'SCHEDULED',
        dueDate: {
          lte: today,
        },
        salaryRequest: {
          employee: {
            employerId,
          },
        },
      },
    });

    if (!repayments.length) {
      throw new BadRequestException(
        'No eligible repayments found for processing',
      );
    }

    const settlementAmount = repayments.reduce(
      (sum, repayment) => sum + Number(repayment.totalAmount),
      0,
    );

    const graceDaysSetting = await this.prisma.setting.findUnique({
      where: {
        key: 'EMPLOYER_GRACE_DAYS',
      },
    });

    const graceDays = Number(graceDaysSetting?.value ?? 3);

    const settlementDueDate = new Date(today);

    settlementDueDate.setDate(settlementDueDate.getDate() + graceDays);

    const settlement = await this.prisma.$transaction(async (tx) => {
      await tx.repayment.updateMany({
        where: {
          id: {
            in: repayments.map((r) => r.id),
          },
        },
        data: {
          status: 'PAID',
          paidDate: new Date(),
        },
      });

      return tx.employerSettlement.create({
        data: {
          employerId,

          payrollMonth,

          principalAmount: settlementAmount,

          lateFeeAmount: 0,

          totalAmount: settlementAmount,

          outstandingAmount: settlementAmount,

          dueDate: settlementDueDate,

          status: 'PENDING',
        },
      });
    });

    return {
      employerId,
      payrollMonth,
      processedRepayments: repayments.length,
      settlementId: settlement.id,
      settlementAmount,
      dueDate: settlementDueDate,
    };
  }
}
