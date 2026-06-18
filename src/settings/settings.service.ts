import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import {
  AdvanceSettings,
  SettingsPolicyService,
} from './settings-policy.service';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsPolicy: SettingsPolicyService,
  ) {}

  async findAll() {
    return this.settingsPolicy.getAllSettings();
  }

  async getAdvanceSettings(): Promise<AdvanceSettings> {
    return this.settingsPolicy.getAdvanceSettings();
  }

  calculateAvailableAdvance(
    salaryInHand: number,
    settings: AdvanceSettings,
  ): number {
    return this.settingsPolicy.calculateAvailableAdvance(
      salaryInHand,
      settings,
    );
  }

  async update(dto: UpdateSettingsDto) {
    const entries = Object.entries(dto);

    for (const [key, value] of entries) {
      if (value === undefined || value === null || value === 'undefined') {
        continue;
      }

      await this.prisma.setting.upsert({
        where: {
          key,
        },
        update: {
          value: String(value),
        },
        create: {
          key,
          value: String(value),
        },
      });
    }

    return this.findAll();
  }
}
