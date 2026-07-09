import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { RazorpayModule } from '../razorpay/razorpay.module';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [RazorpayModule, MembershipModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
