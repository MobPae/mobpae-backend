import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { EmployerProductConfigsController, EmployerSelfProductConfigsController } from './employer-product-configs.controller';
import { EmployerProductConfigsService } from './employer-product-configs.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [EmployerSelfProductConfigsController, EmployerProductConfigsController],
  providers: [EmployerProductConfigsService],
  exports: [EmployerProductConfigsService],
})
export class EmployerProductConfigsModule {}
