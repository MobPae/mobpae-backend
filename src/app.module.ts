import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';

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

import { EmployerEnquiriesModule } from './employer-enquiries/employer-enquiries.module';

import { CommonModule } from './common/common.module';
import { KycDocumentsModule } from './kyc-documents/kyc-documents.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    PrismaModule,

    AuthModule,
    UsersModule,

    EmployersModule,
    EmployeesModule,

    SalaryRequestsModule,
    SalaryLimitsModule,

    DisbursalsModule,
    RepaymentsModule,

    NotificationsModule,
    AuditLogsModule,

    EmployerEnquiriesModule,

    CommonModule,

    KycDocumentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
