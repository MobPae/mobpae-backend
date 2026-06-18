import { Module } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { SettingsModule } from '../settings/settings.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [SettingsModule, AuditLogsModule],
  providers: [PayrollService],
  controllers: [PayrollController],
})
export class PayrollModule {}
