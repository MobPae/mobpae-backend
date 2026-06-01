import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EmployersModule } from './employers/employers.module';
import { EmployeesModule } from './employees/employees.module';
import { SalaryRequestsModule } from './salary-requests/salary-requests.module';
import { SalaryLimitsModule } from './salary-limits/salary-limits.module';
import { DisbursalsModule } from './disbursals/disbursals.module';
import { RepaymentsModule } from './repayments/repayments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [AuthModule, UsersModule, EmployersModule, EmployeesModule, SalaryRequestsModule, SalaryLimitsModule, DisbursalsModule, RepaymentsModule, NotificationsModule, AuditLogsModule, CommonModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
