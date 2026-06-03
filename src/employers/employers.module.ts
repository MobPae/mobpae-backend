import { Module } from '@nestjs/common';

import { EmployersController } from './employers.controller';
import { EmployersService } from './employers.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EmployersController],
  providers: [EmployersService],
})
export class EmployersModule {}
