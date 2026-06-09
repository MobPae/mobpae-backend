import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type MembershipConfig = {
  planName: string;
  fee: number;
  validityLabel: string;
  couponCode: string;
  couponDeduction: number;
};

const DEFAULT_MEMBERSHIP_CONFIG: MembershipConfig = {
  planName: 'MobPae Membership',
  fee: 449,
  validityLabel: '1 year',
  couponCode: 'WELCOME100',
  couponDeduction: 100,
};

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async getEmployeeMembership(employeeId: string) {
    await this.ensureEmployee(employeeId);
    const config = await this.getConfig();
    const active = await this.getBooleanSetting(this.employeeKey(employeeId, 'active'), false);
    const appliedCouponCode = await this.getSettingValue(this.employeeKey(employeeId, 'couponCode'));
    const couponDiscount = this.getCouponDiscount(appliedCouponCode, config);
    const amountPayable = Math.max(0, config.fee - couponDiscount);

    return {
      active,
      planName: config.planName,
      fee: config.fee,
      validityLabel: config.validityLabel,
      couponCode: appliedCouponCode ?? '',
      couponDiscount,
      amountPayable,
    };
  }

  async isActive(employeeId: string) {
    return this.getBooleanSetting(this.employeeKey(employeeId, 'active'), false);
  }

  async applyCoupon(employeeId: string, couponCode: string) {
    await this.ensureEmployee(employeeId);
    const config = await this.getConfig();
    const normalizedCoupon = couponCode.trim().toUpperCase();
    const couponDiscount = this.getCouponDiscount(normalizedCoupon, config);

    if (couponDiscount <= 0) {
      throw new BadRequestException('Invalid coupon code');
    }

    await this.upsertSetting(this.employeeKey(employeeId, 'couponCode'), normalizedCoupon);

    return {
      couponCode: normalizedCoupon,
      couponDiscount,
      amountPayable: Math.max(0, config.fee - couponDiscount),
    };
  }

  async activate(employeeId: string, couponCode?: string) {
    await this.ensureEmployee(employeeId);

    if (couponCode?.trim()) {
      await this.applyCoupon(employeeId, couponCode);
    }

    const membership = await this.getEmployeeMembership(employeeId);
    await this.upsertSetting(this.employeeKey(employeeId, 'active'), 'true');
    await this.upsertSetting(this.employeeKey(employeeId, 'amountPaid'), String(membership.amountPayable));

    return {
      ...membership,
      active: true,
    };
  }

  private async ensureEmployee(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        id: employeeId,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
  }

  private async getConfig(): Promise<MembershipConfig> {
    const keys = [
      'membershipPlanName',
      'membershipFee',
      'membershipValidityLabel',
      'membershipCouponCode',
      'membershipCouponDeduction',
    ];
    const settings = await this.prisma.setting.findMany({
      where: {
        key: {
          in: keys,
        },
      },
    });
    const valueFor = (key: string) => settings.find((setting) => setting.key === key)?.value;

    return {
      planName: valueFor('membershipPlanName') ?? DEFAULT_MEMBERSHIP_CONFIG.planName,
      fee: this.toNumber(valueFor('membershipFee'), DEFAULT_MEMBERSHIP_CONFIG.fee),
      validityLabel: valueFor('membershipValidityLabel') ?? DEFAULT_MEMBERSHIP_CONFIG.validityLabel,
      couponCode: (valueFor('membershipCouponCode') ?? DEFAULT_MEMBERSHIP_CONFIG.couponCode).trim().toUpperCase(),
      couponDeduction: this.toNumber(valueFor('membershipCouponDeduction'), DEFAULT_MEMBERSHIP_CONFIG.couponDeduction),
    };
  }

  private getCouponDiscount(couponCode: string | null | undefined, config: MembershipConfig) {
    if (!couponCode) return 0;
    return couponCode.trim().toUpperCase() === config.couponCode
      ? Math.min(config.fee, config.couponDeduction)
      : 0;
  }

  private async getSettingValue(key: string) {
    const setting = await this.prisma.setting.findUnique({
      where: {
        key,
      },
    });

    return setting?.value ?? null;
  }

  private async getBooleanSetting(key: string, fallback: boolean) {
    const value = await this.getSettingValue(key);
    if (value === null) return fallback;
    return value === 'true';
  }

  private async upsertSetting(key: string, value: string) {
    await this.prisma.setting.upsert({
      where: {
        key,
      },
      update: {
        value,
      },
      create: {
        key,
        value,
      },
    });
  }

  private employeeKey(employeeId: string, key: string) {
    return `membership:${employeeId}:${key}`;
  }

  private toNumber(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
