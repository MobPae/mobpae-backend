import { Module } from '@nestjs/common';

import { EmployerEnquiriesController } from './employer-enquiries.controller';
import { EmployerEnquiriesService } from './employer-enquiries.service';

@Module({
  controllers: [EmployerEnquiriesController],
  providers: [EmployerEnquiriesService],
})
export class EmployerEnquiriesModule {}
