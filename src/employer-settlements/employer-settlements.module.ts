import { Module } from '@nestjs/common';

import { EmployerSettlementsController } from './employer-settlements.controller';
import { EmployerSettlementsService } from './employer-settlements.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EmployerSettlementsController],
  providers: [EmployerSettlementsService],
})
export class EmployerSettlementsModule {}
