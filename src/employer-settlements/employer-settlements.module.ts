import { Module } from '@nestjs/common';

import { EmployerSettlementsController } from './employer-settlements.controller';
import { EmployerSettlementsService } from './employer-settlements.service';

import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { EmailModule } from '../email/email.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, SettingsModule, EmailModule, AuditLogsModule],
  controllers: [EmployerSettlementsController],
  providers: [EmployerSettlementsService],
  exports: [EmployerSettlementsService],
})
export class EmployerSettlementsModule {}
