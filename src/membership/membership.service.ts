import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Employee
   * Get logged-in employee membership
   */
  async getMyMembership(userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        employeeId: employee.id,
      },
    });

    if (!membership) {
      return {
        active: false,
        membership: null,
      };
    }

    const today = new Date();

    const daysRemaining = Math.max(
      0,
      Math.ceil(
        (membership.endDate.getTime() - today.getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    return {
      active: membership.status === 'ACTIVE',
      daysRemaining,
      membership,
    };
  }

  /**
   * Admin
   * Activate membership manually
   */
  async activate(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        id: employeeId,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const amountSetting = await this.prisma.setting.findUnique({
      where: {
        key: 'MEMBERSHIP_AMOUNT',
      },
    });

    const validitySetting = await this.prisma.setting.findUnique({
      where: {
        key: 'MEMBERSHIP_VALIDITY_DAYS',
      },
    });

    const membershipAmount = Number(amountSetting?.value ?? 449);

    const validityDays = Number(validitySetting?.value ?? 365);

    const startDate = new Date();

    const endDate = new Date();

    endDate.setDate(endDate.getDate() + validityDays);

    const existingMembership = await this.prisma.membership.findUnique({
      where: {
        employeeId,
      },
    });

    if (existingMembership && existingMembership.status === 'ACTIVE') {
      throw new BadRequestException('Membership already active');
    }

    return this.prisma.membership.upsert({
      where: {
        employeeId,
      },
      update: {
        planName: 'Annual Membership',
        amount: membershipAmount,
        startDate,
        endDate,
        status: 'ACTIVE',
      },
      create: {
        employeeId,
        planName: 'Annual Membership',
        amount: membershipAmount,
        startDate,
        endDate,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Validation helper
   */
  async isActive(employeeId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        employeeId,
      },
    });

    if (!membership) {
      return false;
    }

    if (membership.status !== 'ACTIVE') {
      return false;
    }

    return membership.endDate > new Date();
  }
}
