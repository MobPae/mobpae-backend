import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DisbursalsController } from './disbursals.controller';
import { DisbursalsService } from './disbursals.service';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, NotificationsModule, EmailModule],
  controllers: [DisbursalsController],
  providers: [DisbursalsService],
})
export class DisbursalsModule {}
