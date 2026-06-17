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

    /**
     * Membership Configuration
     */
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

    const membershipFee = Number(amountSetting?.value ?? 449);

    const membershipValidityDays = Number(validitySetting?.value ?? 365);

    const membership = await this.prisma.membership.findUnique({
      where: {
        employeeId: employee.id,
      },
    });

    /**
     * No membership found
     */
    if (!membership) {
      return {
        active: false,

        membershipFee,
        membershipValidityDays,

        amountPaid: 0,
        planName: null,

        memberSince: null,
        validTill: null,

        daysRemaining: 0,

        membership: null,
      };
    }

    /**
     * Calculate remaining validity
     */
    const today = new Date();

    const daysRemaining = Math.max(
      0,
      Math.ceil(
        (membership.endDate.getTime() - today.getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    /**
     * Employee App Membership Response
     */
    return {
      active: membership.status === 'ACTIVE',

      membershipFee,
      membershipValidityDays,

      amountPaid: Number(membership.amount),

      planName: membership.planName,

      memberSince: membership.startDate,
      validTill: membership.endDate,

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

    const existingMembership = await this.prisma.membership.findUnique({
      where: {
        employeeId: employee.id,
      },
    });

    if (existingMembership?.status === 'ACTIVE') {
      throw new BadRequestException('Membership already active');
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

    let discountAmount = 0;
    let couponCode: string | null = null;

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
      couponCode = coupon.code;
    }

    const payableAmount = Math.max(0, membershipAmount - discountAmount);

    const startDate = new Date();

    const endDate = new Date();

    endDate.setDate(endDate.getDate() + validityDays);

    const membership = await this.prisma.$transaction(async (tx) => {
      if (couponCode) {
        await tx.membershipCoupon.update({
          where: {
            code: couponCode,
          },
          data: {
            usedCount: {
              increment: 1,
            },
          },
        });
      }

      return tx.membership.upsert({
        where: {
          employeeId: employee.id,
        },
        update: {
          planName: 'Annual Membership',
          amount: payableAmount,

          couponCode,
          discountAmount,

          startDate,
          endDate,

          status: 'ACTIVE',

          verifiedAt: new Date(),
          verifiedBy: 'SYSTEM',

          paymentReference: dto.paymentReference ?? null,

          paymentScreenshot: dto.paymentScreenshot ?? null,

          remarks: null,
        },

        create: {
          employeeId: employee.id,

          planName: 'Annual Membership',

          amount: payableAmount,

          couponCode,
          discountAmount,

          startDate,
          endDate,

          status: 'ACTIVE',

          verifiedAt: new Date(),
          verifiedBy: 'SYSTEM',

          paymentReference: dto.paymentReference ?? null,

          paymentScreenshot: dto.paymentScreenshot ?? null,
        },
      });
    });

    return {
      success: true,
      message: 'Membership activated successfully',
      membership,
    };
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

    const membershipRevenue = memberships.reduce(
      (sum, m) => sum + Number(m.amount),
      0,
    );

    return {
      totalMembers: memberships.length,
      active,
      pending,
      rejected,
      expired,
      membershipRevenue,
    };
  }

  async getEmployerSummary() {
    const memberships = await this.prisma.membership.findMany({
      include: {
        employee: {
          include: {
            employer: true,
          },
        },
      },
    });

    const employerMap = new Map();

    for (const membership of memberships) {
      const employer = membership.employee?.employer;

      if (!employer) {
        continue;
      }

      if (!employerMap.has(employer.id)) {
        employerMap.set(employer.id, {
          employerId: employer.id,
          companyName: employer.companyName,
          totalMembers: 0,
          activeMembers: 0,
          membershipRevenue: 0,
        });
      }

      const summary = employerMap.get(employer.id);

      summary.totalMembers++;

      if (membership.status === 'ACTIVE') {
        summary.activeMembers++;
      }

      // Revenue should count all paid memberships
      summary.membershipRevenue += Number(membership.amount);
    }

    return Array.from(employerMap.values()).sort(
      (a, b) => b.membershipRevenue - a.membershipRevenue,
    );
  }

  /**
   * Membership Configuration
   *
   * Powers:
   * - Membership Landing Page
   * - Free vs Premium Comparison
   */
  async getConfig() {
    const settings = await this.prisma.setting.findMany({
      where: {
        key: {
          in: [
            'MEMBERSHIP_AMOUNT',
            'MEMBERSHIP_VALIDITY_DAYS',
            'FREE_BENEFITS',
            'MEMBERSHIP_BENEFITS',
            'MEMBERSHIP_TITLE',
            'MEMBERSHIP_SUBTITLE',
            'FREE_PLAN_TITLE',
            'FREE_PLAN_SUBTITLE',
          ],
        },
      },
    });

    const getValue = (key: string) =>
      settings.find((s) => s.key === key)?.value;

    return {
      membershipFee: Number(getValue('MEMBERSHIP_AMOUNT') ?? 449),

      membershipValidityDays: Number(
        getValue('MEMBERSHIP_VALIDITY_DAYS') ?? 365,
      ),

      freePlanTitle: getValue('FREE_PLAN_TITLE') ?? 'MobPae Free',

      freePlanSubtitle:
        getValue('FREE_PLAN_SUBTITLE') ?? 'Get started with salary advances',

      membershipTitle: getValue('MEMBERSHIP_TITLE') ?? 'MobPae Premium',

      membershipSubtitle:
        getValue('MEMBERSHIP_SUBTITLE') ??
        'Unlock higher limits and priority processing',

      freeBenefits: getValue('FREE_BENEFITS')
        ? JSON.parse(getValue('FREE_BENEFITS')!)
        : [],

      membershipBenefits: getValue('MEMBERSHIP_BENEFITS')
        ? JSON.parse(getValue('MEMBERSHIP_BENEFITS')!)
        : [],
    };
  }

  /**
   * Employee
   * Validate membership coupon
   */
  async validateCoupon(couponCode: string) {
    const amountSetting = await this.prisma.setting.findUnique({
      where: {
        key: 'MEMBERSHIP_AMOUNT',
      },
    });

    const membershipAmount = Number(amountSetting?.value ?? 449);

    const coupon = await this.prisma.membershipCoupon.findUnique({
      where: {
        code: couponCode.trim().toUpperCase(),
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

    const discountAmount = Number(coupon.discountAmount);

    const payableAmount = Math.max(0, membershipAmount - discountAmount);

    return {
      valid: true,
      couponCode: coupon.code,
      membershipAmount,
      discountAmount,
      payableAmount,
      savings: discountAmount,
    };
  }

  // Adding to MembershipService (dedicated RevenueService later)
  async getRevenueSummary() {
    const memberships = await this.prisma.membership.findMany();

    const repayments = await this.prisma.repayment.findMany();

    const membershipRevenue = memberships.reduce(
      (sum, membership) => sum + Number(membership.amount),
      0,
    );

    const interestRevenue = repayments.reduce(
      (sum, repayment) => sum + Number(repayment.interestAmount),
      0,
    );

    return {
      membershipRevenue,
      interestRevenue,
      totalRevenue: membershipRevenue + interestRevenue,
    };
  }
}
