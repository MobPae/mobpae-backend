import { Module } from '@nestjs/common';
import { AppInformationController } from './app-information.controller';
import { AppInformationService } from './app-information.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AppInformationController],
  providers: [AppInformationService],
  exports: [AppInformationService],
})
export class AppInformationModule {}
