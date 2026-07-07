/**
 * GlobalSettingsService — reads non-lending platform settings from the `settings` table.
 *
 * Lending rules (interest rates, advance percentages, eligibility) live in
 * LoanProductConfig.eligibilityRules / pricingRules, NOT here.
 *
 * This service covers: OTP TTL, app version, maintenance mode, notification toggles,
 * employer settlement policy, membership payment details.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type EmployerSettlementPolicy = {
  gracePeriodDays: number;
  lateFeePercentage: number;
};

export type MembershipPaymentInfo = {
  upiId: string;
  beneficiary: string;
  instructions: string;
};

@Injectable()
export class SettingsPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllSettings() {
    const settings = await this.prisma.setting.findMany();
    return settings.reduce<Record<string, string>>((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {});
  }

  async getEmployerSettlementPolicy(): Promise<EmployerSettlementPolicy> {
    const settings = await this.getAllSettings();
    return {
      gracePeriodDays: this.toNumber(settings['employer.grace_days'], 3),
      lateFeePercentage: this.toNumber(
        settings['employer.late_fee_percentage'],
        30,
      ),
    };
  }

  async getMembershipPaymentInfo(): Promise<MembershipPaymentInfo> {
    const settings = await this.getAllSettings();
    return {
      upiId: settings['membership.payment_upi_id'] ?? '',
      beneficiary: settings['membership.payment_beneficiary'] ?? '',
      instructions: settings['membership.payment_instructions'] ?? '',
    };
  }

  async isMaintenanceMode(): Promise<boolean> {
    const settings = await this.getAllSettings();
    return this.toBoolean(settings['app.maintenance_mode'], false);
  }

  async getMaintenanceMessage(): Promise<string> {
    const settings = await this.getAllSettings();
    return (
      settings['app.maintenance_message'] ??
      'We are currently under maintenance. Please try again shortly.'
    );
  }

  private toNumber(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toBoolean(value: unknown, fallback: boolean) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'boolean') return value;
    return String(value).toLowerCase() === 'true';
  }
}
