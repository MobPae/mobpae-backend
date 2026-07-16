import { Module } from '@nestjs/common';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { EligibilityModule } from '../eligibility/eligibility.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformFeesModule } from '../platform-fees/platform-fees.module';
import { PricingModule } from '../pricing/pricing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

import { LoanApplicationsController } from './loan-applications.controller';
import { LoanApplicationsService } from './loan-applications.service';

@Module({
  imports: [
    PrismaModule,
    PricingModule,
    EligibilityModule,
    NotificationsModule,
    AuditLogsModule,
    PlatformFeesModule,
    AuthModule,
  ],
  controllers: [LoanApplicationsController],
  providers: [LoanApplicationsService],
  exports: [LoanApplicationsService],
})
export class LoanApplicationsModule {}
