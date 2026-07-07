import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RepaymentsController } from './repayments.controller';
import { RepaymentsService } from './repayments.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, NotificationsModule, EmailModule],
  controllers: [RepaymentsController],
  providers: [RepaymentsService],
})
export class RepaymentsModule {}
