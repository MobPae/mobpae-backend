import { Module } from '@nestjs/common';

import { EmployerEnquiriesController } from './employer-enquiries.controller';
import { EmployerEnquiriesService } from './employer-enquiries.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [EmployerEnquiriesController],
  providers: [EmployerEnquiriesService],
})
export class EmployerEnquiriesModule {}
