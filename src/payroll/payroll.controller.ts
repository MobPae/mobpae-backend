import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PayrollService } from './payroll.service';
import { UpdatePayrollSettingsDto } from './dto/update-payroll-settings.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Payroll')
@ApiBearerAuth()
@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get('employer/summary')
  @Roles('EMPLOYER')
  getSummary(@Req() req: any) {
    return this.payrollService.getSummary(req.user.userId);
  }

  @Get('employer/recoveries')
  @Roles('EMPLOYER')
  getRecoveries(@Req() req: any) {
    return this.payrollService.getRecoveries(req.user.userId);
  }

  @Put('employer/settings')
  @Roles('EMPLOYER')
  updateSettings(@Req() req: any, @Body() dto: UpdatePayrollSettingsDto) {
    return this.payrollService.updateSettings(req.user.userId, dto);
  }
}
