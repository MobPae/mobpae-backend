import { Module } from '@nestjs/common';

import { EmployerSettlementsController } from './employer-settlements.controller';
import { EmployerSettlementsService } from './employer-settlements.service';

import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [EmployerSettlementsController],
  providers: [EmployerSettlementsService],
})
export class EmployerSettlementsModule {}
