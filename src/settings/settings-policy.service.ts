import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export type AdvanceSettings = {
  advancePercentage: number;
  interestChargePercentage: number;
  processingFeePercentage: number;
  minimumSalary: number;
  maximumAdvance: number;
  requireKyc: boolean;
  requireBankVerification: boolean;
  allowMultipleRequestsPerCycle: boolean;
  allowRequestWithOutstandingBalance: boolean;
  salaryRequestAlert: boolean;
  repaymentAlert: boolean;
  kycAlert: boolean;
  bankVerificationAlert: boolean;
};

export type MembershipPolicy = {
  amount: number;
  validityDays: number;
};

export type EmployerSettlementPolicy = {
  gracePeriodDays: number;
  lateFeePercentage: number;
};

const DEFAULT_ADVANCE_SETTINGS: AdvanceSettings = {
  advancePercentage: 10,
  interestChargePercentage: 36,
  processingFeePercentage: 0,
  minimumSalary: 10000,
  maximumAdvance: 10000,
  requireKyc: true,
  requireBankVerification: true,
  allowMultipleRequestsPerCycle: false,
  allowRequestWithOutstandingBalance: false,
  salaryRequestAlert: true,
  repaymentAlert: true,
  kycAlert: true,
  bankVerificationAlert: true,
};

@Injectable()
export class SettingsPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllSettings() {
    const settings = await this.prisma.setting.findMany();

    return settings.reduce<Record<string, string>>((result, setting) => {
      result[setting.key] = setting.value;
      return result;
    }, {});
  }

  async getAdvanceSettings(): Promise<AdvanceSettings> {
    const settings = await this.getAllSettings();

    return {
      advancePercentage: this.toNumber(
        settings.advancePercentage,
        DEFAULT_ADVANCE_SETTINGS.advancePercentage,
      ),
      interestChargePercentage: this.toNumber(
        settings.interestChargePercentage ?? settings.ANNUAL_INTEREST_RATE,
        DEFAULT_ADVANCE_SETTINGS.interestChargePercentage,
      ),
      processingFeePercentage: this.toNumber(
        settings.processingFeePercentage,
        DEFAULT_ADVANCE_SETTINGS.processingFeePercentage,
      ),
      minimumSalary: this.toNumber(
        settings.minimumSalary,
        DEFAULT_ADVANCE_SETTINGS.minimumSalary,
      ),
      maximumAdvance: this.toNumber(
        settings.maximumAdvance,
        DEFAULT_ADVANCE_SETTINGS.maximumAdvance,
      ),
      requireKyc: this.toBoolean(
        settings.requireKyc,
        DEFAULT_ADVANCE_SETTINGS.requireKyc,
      ),
      requireBankVerification: this.toBoolean(
        settings.requireBankVerification,
        DEFAULT_ADVANCE_SETTINGS.requireBankVerification,
      ),
      allowMultipleRequestsPerCycle: this.toBoolean(
        settings.allowMultipleRequestsPerCycle,
        DEFAULT_ADVANCE_SETTINGS.allowMultipleRequestsPerCycle,
      ),
      allowRequestWithOutstandingBalance: this.toBoolean(
        settings.allowRequestWithOutstandingBalance,
        DEFAULT_ADVANCE_SETTINGS.allowRequestWithOutstandingBalance,
      ),
      salaryRequestAlert: this.toBoolean(
        settings.salaryRequestAlert,
        DEFAULT_ADVANCE_SETTINGS.salaryRequestAlert,
      ),
      repaymentAlert: this.toBoolean(
        settings.repaymentAlert,
        DEFAULT_ADVANCE_SETTINGS.repaymentAlert,
      ),
      kycAlert: this.toBoolean(
        settings.kycAlert,
        DEFAULT_ADVANCE_SETTINGS.kycAlert,
      ),
      bankVerificationAlert: this.toBoolean(
        settings.bankVerificationAlert,
        DEFAULT_ADVANCE_SETTINGS.bankVerificationAlert,
      ),
    };
  }

  async getAnnualInterestRate() {
    const settings = await this.getAllSettings();

    return this.toNumber(
      settings.ANNUAL_INTEREST_RATE ?? settings.interestChargePercentage,
      DEFAULT_ADVANCE_SETTINGS.interestChargePercentage,
    );
  }

  async getMembershipPolicy(): Promise<MembershipPolicy> {
    const settings = await this.getAllSettings();

    return {
      amount: this.toNumber(settings.MEMBERSHIP_AMOUNT, 449),
      validityDays: this.toNumber(settings.MEMBERSHIP_VALIDITY_DAYS, 365),
    };
  }

  async getEmployerSettlementPolicy(): Promise<EmployerSettlementPolicy> {
    const settings = await this.getAllSettings();

    return {
      gracePeriodDays: this.toNumber(settings.EMPLOYER_GRACE_DAYS, 3),
      lateFeePercentage: this.toNumber(
        settings.EMPLOYER_LATE_FEE_PERCENTAGE,
        30,
      ),
    };
  }

  calculateAvailableAdvance(
    salaryInHand: number,
    settings: AdvanceSettings,
  ): number {
    if (salaryInHand < settings.minimumSalary) {
      return 0;
    }

    const percentageLimit = (salaryInHand * settings.advancePercentage) / 100;
    return Number(
      Math.min(percentageLimit, settings.maximumAdvance).toFixed(2),
    );
  }

  private toNumber(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toBoolean(value: unknown, fallback: boolean) {
    if (value === undefined || value === null) {
      return fallback;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    return String(value).toLowerCase() === 'true';
  }
}
