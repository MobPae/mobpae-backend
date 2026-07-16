import { Module } from '@nestjs/common';

import { EmployersController } from './employers.controller';
import { EmployersService } from './employers.service';

import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';
import { EmployerMembersModule } from '../employer-members/employer-members.module';

@Module({
  imports: [PrismaModule, EmailModule, AuditLogsModule, AuthModule, EmployerMembersModule],
  controllers: [EmployersController],
  providers: [EmployersService],
})
export class EmployersModule {}
