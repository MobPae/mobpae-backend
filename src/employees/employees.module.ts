import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';

import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';

@Module({
  imports: [
    PrismaModule,
    AuditLogsModule,
    FilesModule,
    NotificationsModule,
    EmailModule,
  ],
  providers: [EmployeesService],
  controllers: [EmployeesController],
})
export class EmployeesModule {}
