import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SalaryLimitsController } from './salary-limits.controller';
import { SalaryLimitsService } from './salary-limits.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [SalaryLimitsController],
  providers: [SalaryLimitsService],
})
export class SalaryLimitsModule {}
