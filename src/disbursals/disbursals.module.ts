import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DisbursalsController } from './disbursals.controller';
import { DisbursalsService } from './disbursals.service';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [DisbursalsController],
  providers: [DisbursalsService],
})
export class DisbursalsModule {}
