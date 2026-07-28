import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

import { EmployersModule } from './employers/employers.module';
import { EmployerMembersModule } from './employer-members/employer-members.module';
import { EmployeesModule } from './employees/employees.module';

import { LoanProductsModule } from './loan-products/loan-products.module';
import { EmployerProductConfigsModule } from './employer-product-configs/employer-product-configs.module';
import { PricingModule } from './pricing/pricing.module';
import { EligibilityModule } from './eligibility/eligibility.module';
import { LoanApplicationsModule } from './loan-applications/loan-applications.module';

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
import { EmployerSettlementsModule } from './employer-settlements/employer-settlements.module';
import { EmailModule } from './email/email.module';
import { HealthModule } from './health/health.module';
import { SessionsModule } from './sessions/sessions.module';
import { FilesModule } from './files/files.module';
import { ReportsModule } from './reports/reports.module';
import { BusinessJobsModule } from './business-jobs/business-jobs.module';
import { AppInformationModule } from './app-information/app-information.module';
import { RazorpayModule } from './razorpay/razorpay.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { PlatformFeesModule } from './platform-fees/platform-fees.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        // Min length is a floor, not a recommendation — see deployment.md for
        // the production requirement (64+ random chars).
        JWT_SECRET: Joi.string().min(32).required(),
        // Base64-encoded 32-byte AES-256 key for bank account field encryption.
        BANK_ENCRYPTION_KEY: Joi.string().required(),
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
        EMPLOYER_PORTAL_URL: Joi.string().uri().required(),
        CORS_ORIGINS: Joi.string().optional(),
        ENABLE_SWAGGER: Joi.boolean()
          .truthy('true')
          .falsy('false')
          .default(false),
        ENABLE_LOCAL_UPLOADS: Joi.boolean()
          .truthy('true')
          .falsy('false')
          .default(false),
        // Cloudflare R2 — required; bucket is private, no public URL needed
        R2_ACCOUNT_ID: Joi.string().required(),
        R2_ACCESS_KEY_ID: Joi.string().required(),
        R2_SECRET_ACCESS_KEY: Joi.string().required(),
        R2_BUCKET_NAME: Joi.string().required(),
        // Razorpay — required for request-scoped platform fees.
        RAZORPAY_KEY_ID: Joi.string().required(),
        RAZORPAY_KEY_SECRET: Joi.string().required(),
        RAZORPAY_WEBHOOK_SECRET: Joi.string().required(),
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
    StorageModule,

    AuthModule,
    UsersModule,

    EmployersModule,
    EmployerMembersModule,
    EmployeesModule,

    LoanProductsModule,
    EmployerProductConfigsModule,
    PricingModule,
    EligibilityModule,
    LoanApplicationsModule,

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

    EmployerSettlementsModule,

    EmailModule,

    HealthModule,

    SessionsModule,

    FilesModule,

    ReportsModule,

    BusinessJobsModule,

    AppInformationModule,

    RazorpayModule,
    PlatformFeesModule,
    WebhooksModule,
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
