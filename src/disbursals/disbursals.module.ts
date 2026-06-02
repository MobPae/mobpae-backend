import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { DisbursalsController } from './disbursals.controller';
import { DisbursalsService } from './disbursals.service';

@Module({
  imports: [PrismaModule],
  controllers: [DisbursalsController],
  providers: [DisbursalsService],
})
export class DisbursalsModule {}
