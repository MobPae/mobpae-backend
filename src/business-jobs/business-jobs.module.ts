import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { EmployerSettlementsModule } from '../employer-settlements/employer-settlements.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BusinessJobsService } from './business-jobs.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AuditLogsModule,
    NotificationsModule,
    EmployerSettlementsModule,
  ],
  providers: [BusinessJobsService],
  exports: [BusinessJobsService],
})
export class BusinessJobsModule {}
