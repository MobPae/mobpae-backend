import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';

@Module({
  imports: [PrismaModule],
  controllers: [MembershipController],
  providers: [MembershipService],
})
export class MembershipModule {}
