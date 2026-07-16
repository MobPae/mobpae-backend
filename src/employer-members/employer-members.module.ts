import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';
import { EmployerMembersController } from './employer-members.controller';
import { EmployerMembersService } from './employer-members.service';

@Module({
  imports: [PrismaModule, EmailModule, AuditLogsModule, AuthModule],
  controllers: [EmployerMembersController],
  providers: [EmployerMembersService],
  exports: [EmployerMembersService],
})
export class EmployerMembersModule {}
