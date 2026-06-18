import { Module } from '@nestjs/common';

import { EmployerEnquiriesController } from './employer-enquiries.controller';
import { EmployerEnquiriesService } from './employer-enquiries.service';
import { EmailModule } from '../email/email.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [EmailModule, AuditLogsModule],
  controllers: [EmployerEnquiriesController],
  providers: [EmployerEnquiriesService],
})
export class EmployerEnquiriesModule {}
