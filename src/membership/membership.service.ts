import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RequestMembershipDto } from './dto/request-membership.dto';
import { CreateMembershipCouponDto } from './dto/create-membership-coupon.dto';

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

    if (membership.status === 'ACTIVE' && membership.endDate < new Date()) {
      await this.prisma.membership.update({
        where: {
          id: membership.id,
        },
        data: {
          status: 'EXPIRED',
        },
      });

      return false;
    }

    return membership.status === 'ACTIVE' && membership.endDate > new Date();
  }

  async requestMembership(userId: string, dto: RequestMembershipDto) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
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

    const membershipAmount = Number(amountSetting?.value ?? 449);

    let discountAmount = 0;

    if (dto.couponCode?.trim()) {
      const coupon = await this.prisma.membershipCoupon.findUnique({
        where: {
          code: dto.couponCode.trim().toUpperCase(),
        },
      });

      if (!coupon) {
        throw new BadRequestException('Invalid coupon code');
      }

      if (!coupon.isActive) {
        throw new BadRequestException('Coupon is inactive');
      }

      if (coupon.validTill && coupon.validTill < new Date()) {
        throw new BadRequestException('Coupon expired');
      }

      if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
        throw new BadRequestException('Coupon usage limit reached');
      }

      discountAmount = Number(coupon.discountAmount);
    }

    const payableAmount = Math.max(0, membershipAmount - discountAmount);
    const placeholderDate = new Date('2099-01-01');

    return this.prisma.membership.upsert({
      where: {
        employeeId: employee.id,
      },
      update: {
        amount: payableAmount,
        couponCode: dto.couponCode?.trim().toUpperCase(),
        discountAmount,
        paymentReference: dto.paymentReference,
        paymentScreenshot: dto.paymentScreenshot,
        status: 'PENDING',
        remarks: null,
        verifiedAt: null,
        verifiedBy: null,
      },
      create: {
        employeeId: employee.id,
        planName: 'Annual Membership',
        amount: payableAmount,
        startDate: placeholderDate,
        endDate: placeholderDate,
        status: 'PENDING',
        couponCode: dto.couponCode?.trim().toUpperCase(),
        discountAmount,
        paymentReference: dto.paymentReference,
        paymentScreenshot: dto.paymentScreenshot,
      },
    });
  }

  async findPending() {
    return this.prisma.membership.findMany({
      where: {
        status: 'PENDING',
      },
      include: {
        employee: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async approve(membershipId: string, adminUserId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        id: membershipId,
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.status === 'ACTIVE') {
      throw new BadRequestException('Membership already approved');
    }

    const validitySetting = await this.prisma.setting.findUnique({
      where: {
        key: 'MEMBERSHIP_VALIDITY_DAYS',
      },
    });

    const validityDays = Number(validitySetting?.value ?? 365);

    const startDate = new Date();

    const endDate = new Date();

    endDate.setDate(endDate.getDate() + validityDays);

    return this.prisma.$transaction(async (tx) => {
      if (membership.couponCode) {
        const coupon = await tx.membershipCoupon.findUnique({
          where: {
            code: membership.couponCode,
          },
        });

        if (coupon) {
          await tx.membershipCoupon.update({
            where: {
              id: coupon.id,
            },
            data: {
              usedCount: {
                increment: 1,
              },
            },
          });
        }
      }

      return tx.membership.update({
        where: {
          id: membershipId,
        },
        data: {
          status: 'ACTIVE',
          startDate,
          endDate,
          verifiedAt: new Date(),
          verifiedBy: adminUserId,
          remarks: null,
        },
      });
    });
  }

  async reject(membershipId: string, remarks: string) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        id: membershipId,
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    return this.prisma.membership.update({
      where: {
        id: membershipId,
      },
      data: {
        status: 'REJECTED',
        remarks,
      },
    });
  }

  /**
   * Admin
   * Create membership coupon
   */
  async createCoupon(dto: CreateMembershipCouponDto) {
    return this.prisma.membershipCoupon.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        discountAmount: dto.discountAmount,
        validTill: dto.validTill,
        isActive: dto.isActive ?? true,
      },
    });
  }

  /**
   * Admin
   * View all coupons
   */
  async findAllCoupons() {
    return this.prisma.membershipCoupon.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        id,
      },

      include: {
        employee: true,
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    return membership;
  }

  async findAll() {
    return this.prisma.membership.findMany({
      include: {
        employee: {
          include: {
            employer: true,
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getSummary() {
    const memberships = await this.prisma.membership.findMany();

    const active = memberships.filter((m) => m.status === 'ACTIVE').length;

    const pending = memberships.filter((m) => m.status === 'PENDING').length;

    const rejected = memberships.filter((m) => m.status === 'REJECTED').length;

    const expired = memberships.filter(
      (m) => m.status === 'ACTIVE' && m.endDate < new Date(),
    ).length;

    const revenue = memberships

      .filter((m) => m.status === 'ACTIVE')

      .reduce(
        (sum, m) => sum + Number(m.amount),

        0,
      );

    return {
      active,
      pending,
      rejected,
      expired,
      revenue,
    };
  }
}
