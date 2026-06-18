import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { KycDocumentsController } from './kyc-documents.controller';
import { KycController } from './kyc.controller';
import { KycDocumentsService } from './kyc-documents.service';

@Module({
  imports: [PrismaModule, EmailModule, AuditLogsModule, NotificationsModule],
  controllers: [KycDocumentsController, KycController],
  providers: [KycDocumentsService],
})
export class KycDocumentsModule {}
