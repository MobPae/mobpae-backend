import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { RazorpayModule } from '../razorpay/razorpay.module';
import { PlatformFeesModule } from '../platform-fees/platform-fees.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, RazorpayModule, PlatformFeesModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
