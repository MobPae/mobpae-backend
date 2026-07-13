import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingModule } from '../pricing/pricing.module';
import { DisbursalsController } from './disbursals.controller';
import { DisbursalsService } from './disbursals.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PlatformFeesModule } from '../platform-fees/platform-fees.module';

@Module({
  imports: [
    PrismaModule,
    PricingModule,
    NotificationsModule,
    EmailModule,
    AuditLogsModule,
    PlatformFeesModule,
  ],
  controllers: [DisbursalsController],
  providers: [DisbursalsService],
})
export class DisbursalsModule {}
