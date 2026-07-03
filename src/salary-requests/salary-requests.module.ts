import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { SalaryRequestsController } from './salary-requests.controller';
import { SalaryRequestsService } from './salary-requests.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { MembershipModule } from '../membership/membership.module';
import { EmailModule } from '../email/email.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    SettingsModule,
    MembershipModule,
    EmailModule,
    AuditLogsModule,
  ],
  controllers: [SalaryRequestsController],
  providers: [SalaryRequestsService],
  exports: [SalaryRequestsService],
})
export class SalaryRequestsModule {}
