import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SettingsPolicyService } from './settings-policy.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, SettingsPolicyService, PrismaService],
  exports: [SettingsService, SettingsPolicyService],
})
export class SettingsModule {}
