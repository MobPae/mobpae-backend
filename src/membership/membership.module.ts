import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { RazorpayModule } from '../razorpay/razorpay.module';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    NotificationsModule,
    AuditLogsModule,
    RazorpayModule,
  ],
  controllers: [MembershipController],
  providers: [MembershipService],
  exports: [MembershipService],
})
export class MembershipModule {}
