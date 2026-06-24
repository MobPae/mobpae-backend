import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';

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
import { DashboardModule } from './dashboard/dashboard.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { SettingsModule } from './settings/settings.module';
import { PayrollModule } from './payroll/payroll.module';
import { MembershipModule } from './membership/membership.module';
import { EmployerSettlementsModule } from './employer-settlements/employer-settlements.module';
import { EmailModule } from './email/email.module';
import { HealthModule } from './health/health.module';
import { SessionsModule } from './sessions/sessions.module';
import { FilesModule } from './files/files.module';
import { ReportsModule } from './reports/reports.module';
import { BusinessJobsModule } from './business-jobs/business-jobs.module';
import { AppInformationModule } from './app-information/app-information.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        SMTP_HOST: Joi.string().required(),
        SMTP_PORT: Joi.number().required(),
        SMTP_USER: Joi.string().required(),
        SMTP_PASS: Joi.string().required(),
        SMTP_SECURE: Joi.boolean()
          .truthy('true')
          .falsy('false')
          .default(false)
          .optional(),
        MAIL_FROM: Joi.string().email().required(),
        MAIL_FROM_NAME: Joi.string().required(),
        FRONTEND_URL: Joi.string().uri().required(),
        CORS_ORIGINS: Joi.string().optional(),
        ENABLE_SWAGGER: Joi.boolean()
          .truthy('true')
          .falsy('false')
          .default(false),
      }),
    }),

    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: 60_000,
          limit: 120,
        },
      ],
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

    DashboardModule,

    BankAccountsModule,

    SettingsModule,

    PayrollModule,

    MembershipModule,

    EmployerSettlementsModule,

    EmailModule,

    HealthModule,

    SessionsModule,

    FilesModule,

    ReportsModule,

    BusinessJobsModule,

    AppInformationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
