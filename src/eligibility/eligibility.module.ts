import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EligibilityService } from './eligibility.service';

@Module({
  imports: [PrismaModule],
  providers: [EligibilityService],
  exports: [EligibilityService],
})
export class EligibilityModule {}
