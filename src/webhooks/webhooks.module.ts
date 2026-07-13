import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { RazorpayModule } from '../razorpay/razorpay.module';
import { MembershipModule } from '../membership/membership.module';
import { PlatformFeesModule } from '../platform-fees/platform-fees.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, RazorpayModule, MembershipModule, PlatformFeesModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
