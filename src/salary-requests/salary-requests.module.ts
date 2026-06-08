import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { SalaryRequestsController } from './salary-requests.controller';
import { SalaryRequestsService } from './salary-requests.service';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [PrismaModule, NotificationsModule, SettingsModule],
  controllers: [SalaryRequestsController],
  providers: [SalaryRequestsService],
})
export class SalaryRequestsModule {}
