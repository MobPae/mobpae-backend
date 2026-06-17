import { Module } from '@nestjs/common';

import { EmployersController } from './employers.controller';
import { EmployersService } from './employers.service';

import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [EmployersController],
  providers: [EmployersService],
})
export class EmployersModule {}
