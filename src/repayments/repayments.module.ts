import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { RepaymentsController } from './repayments.controller';
import { RepaymentsService } from './repayments.service';

@Module({
  imports: [PrismaModule],
  controllers: [RepaymentsController],
  providers: [RepaymentsService],
})
export class RepaymentsModule {}
