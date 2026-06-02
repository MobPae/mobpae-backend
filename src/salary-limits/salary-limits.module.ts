import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { SalaryLimitsController } from './salary-limits.controller';
import { SalaryLimitsService } from './salary-limits.service';

@Module({
  imports: [PrismaModule],
  controllers: [SalaryLimitsController],
  providers: [SalaryLimitsService],
})
export class SalaryLimitsModule {}
