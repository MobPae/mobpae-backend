import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';

@Module({
  imports: [PrismaModule, AuditLogsModule, NotificationsModule],
  controllers: [BankAccountsController],
  providers: [BankAccountsService],
})
export class BankAccountsModule {}
