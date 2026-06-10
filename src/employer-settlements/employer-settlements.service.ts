import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmployerSettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Admin
   * View all employer settlements.
   *
   * Used by:
   * - Admin Settlement Dashboard
   * - Settlement Monitoring Screen
   */
  async findAll() {
    return this.prisma.employerSettlement.findMany({
      include: {
        employer: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Admin
   * View settlement details.
   * Returns:
   * - Settlement information
   * - Employer information
   */
  async findOne(id: string) {
    const settlement = await this.prisma.employerSettlement.findUnique({
      where: {
        id,
      },
      include: {
        employer: true,
      },
    });

    if (!settlement) {
      throw new NotFoundException('Settlement not found');
    }

    return settlement;
  }

  /**
   * Employer
   * View own settlements
   */
  async findByEmployer(userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new BadRequestException('Employer not found');
    }

    return this.prisma.employerSettlement.findMany({
      where: {
        employerId: employer.id,
      },
      orderBy: {
        payrollMonth: 'desc',
      },
    });
  }

  /**
   * Admin
   * Mark settlement as paid
   */
  async markPaid(id: string, referenceNumber?: string) {
    const settlement = await this.prisma.employerSettlement.findUnique({
      where: {
        id,
      },
    });

    if (!settlement) {
      throw new NotFoundException('Settlement not found');
    }

    if (settlement.status === 'PAID') {
      throw new BadRequestException('Settlement already paid');
    }

    return this.prisma.employerSettlement.update({
      where: {
        id,
      },
      data: {
        status: 'PAID',
        paidDate: new Date(),
        outstandingAmount: 0,
        referenceNumber,
      },
    });
  }

  async getSummary(userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new BadRequestException('Employer not found');
    }

    const settlements = await this.prisma.employerSettlement.findMany({
      where: {
        employerId: employer.id,
      },
      orderBy: {
        dueDate: 'asc',
      },
    });

    const outstandingAmount = settlements
      .filter((s) => s.status !== 'PAID')
      .reduce(
        (sum, settlement) => sum + Number(settlement.outstandingAmount),
        0,
      );

    const overdueAmount = settlements
      .filter((s) => s.status === 'OVERDUE')
      .reduce(
        (sum, settlement) => sum + Number(settlement.outstandingAmount),
        0,
      );

    const pendingSettlements = settlements.filter(
      (s) => s.status === 'PENDING',
    ).length;

    const paidSettlements = settlements.filter(
      (s) => s.status === 'PAID',
    ).length;

    const nextDueSettlement = settlements.find((s) => s.status !== 'PAID');

    return {
      outstandingAmount,
      overdueAmount,
      pendingSettlements,
      paidSettlements,
      nextDueDate: nextDueSettlement?.dueDate ?? null,
      riskStatus: employer.riskStatus,
    };
  }

  async updateEmployerRiskStatus(employerId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        id: employerId,
      },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    const graceSetting = await this.prisma.setting.findUnique({
      where: {
        key: 'EMPLOYER_GRACE_DAYS',
      },
    });

    const graceDays = Number(graceSetting?.value ?? 3);

    const today = new Date();

    const settlements = await this.prisma.employerSettlement.findMany({
      where: {
        employerId,
        status: {
          in: ['PENDING', 'PARTIALLY_PAID'],
        },
      },
    });

    let riskStatus: 'GOOD' | 'WARNING' | 'BLOCKED' = 'GOOD';

    for (const settlement of settlements) {
      const overdueDate = new Date(settlement.dueDate);

      overdueDate.setDate(overdueDate.getDate() + graceDays);

      if (today > overdueDate) {
        riskStatus = 'BLOCKED';

        await this.prisma.employerSettlement.update({
          where: {
            id: settlement.id,
          },
          data: {
            status: 'OVERDUE',
          },
        });

        break;
      }

      if (today > settlement.dueDate) {
        riskStatus = 'WARNING';
      }
    }

    await this.prisma.employer.update({
      where: {
        id: employerId,
      },
      data: {
        riskStatus,
      },
    });

    return {
      employerId,
      riskStatus,
    };
  }

  /**

 * Admin
 * Generate employer settlement for a payroll cycle.
 *
 * Business Flow:
 * 1. Validate settlement does not already exist.
 * 2. Fetch all outstanding employee repayments for employer.
 * 3. Calculate total principal amount.
 * 4. Calculate total recovery amount (principal + interest).
 * 5. Create settlement record.

 * Example:
 * Employee A = ₹5,040
 * Employee B = ₹6,055
 * Employee C = ₹4,035
 *

 * Settlement:
 * Principal = ₹15,000
 * Total = ₹15,130
 *

 * Result:
 * Employer owes MobPae ₹15,130.
 */

  async generateSettlement(employerId: string, payrollMonth: string) {
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
        'Settlement already exists for this payroll month',
      );
    }

    const repayments = await this.prisma.repayment.findMany({
      where: {
        status: {
          in: ['SCHEDULED', 'OVERDUE'],
        },
        salaryRequest: {
          employerId,
        },
      },
      include: {
        salaryRequest: true,
      },
    });

    if (!repayments.length) {
      throw new BadRequestException(
        'No repayments found for settlement generation',
      );
    }

    const principalAmount = repayments.reduce(
      (sum, repayment) => sum + Number(repayment.principalAmount),
      0,
    );

    const totalAmount = repayments.reduce(
      (sum, repayment) => sum + Number(repayment.totalAmount),
      0,
    );

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    return this.prisma.employerSettlement.create({
      data: {
        employerId,
        payrollMonth,

        principalAmount,

        totalAmount,

        outstandingAmount: totalAmount,

        dueDate,

        status: 'PENDING',
      },
    });
  }
}
