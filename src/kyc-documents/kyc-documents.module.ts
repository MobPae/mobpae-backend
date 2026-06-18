import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

import { KycDocumentsController } from './kyc-documents.controller';
import { KycController } from './kyc.controller';
import { KycDocumentsService } from './kyc-documents.service';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [KycDocumentsController, KycController],
  providers: [KycDocumentsService],
})
export class KycDocumentsModule {}
