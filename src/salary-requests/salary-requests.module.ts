import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { SalaryRequestsController } from './salary-requests.controller';
import { SalaryRequestsService } from './salary-requests.service';

@Module({
  imports: [PrismaModule],
  controllers: [SalaryRequestsController],
  providers: [SalaryRequestsService],
})
export class SalaryRequestsModule {}
