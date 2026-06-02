import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RepaymentsController } from './repayments.controller';
import { RepaymentsService } from './repayments.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [RepaymentsController],
  providers: [RepaymentsService],
})
export class RepaymentsModule {}
