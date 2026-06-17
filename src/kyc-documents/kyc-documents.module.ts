import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

import { KycDocumentsController } from './kyc-documents.controller';
import { KycDocumentsService } from './kyc-documents.service';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [KycDocumentsController],
  providers: [KycDocumentsService],
})
export class KycDocumentsModule {}
