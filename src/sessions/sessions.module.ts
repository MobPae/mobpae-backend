import { Module } from '@nestjs/common';
import { SessionCleanupService } from './session-cleanup.service';

@Module({
  providers: [SessionCleanupService],
})
export class SessionsModule {}
