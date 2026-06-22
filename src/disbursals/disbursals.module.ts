import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DisbursalsController } from './disbursals.controller';
import { DisbursalsService } from './disbursals.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    EmailModule,
    AuditLogsModule,
    SettingsModule,
  ],
  controllers: [DisbursalsController],
  providers: [DisbursalsService],
})
export class DisbursalsModule {}
