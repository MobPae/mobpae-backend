import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

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

  /**
   * Employer Payroll Summary
   */
  @Get('employer/summary')
  @Roles('EMPLOYER')
  @ApiOperation({
    summary: 'Get payroll summary',
  })
  getSummary(@Req() req: any) {
    return this.payrollService.getSummary(req.user.userId);
  }

  /**

 * Employer Process Payroll

 */

  @Post('employer/process')
  @Roles('EMPLOYER')
  @ApiOperation({
    summary: 'Process employer payroll recoveries',
  })
  processEmployerPayroll(@Req() req: any) {
    return this.payrollService.processRecoveryForEmployer(req.user.userId);
  }

  /**
   * Employer Recoveries
   */
  @Get('employer/recoveries')
  @Roles('EMPLOYER')
  @ApiOperation({
    summary: 'Get payroll recoveries',
  })
  getRecoveries(@Req() req: any) {
    return this.payrollService.getRecoveries(req.user.userId);
  }

  /**
   * Employer Payroll Settings
   */
  @Put('employer/settings')
  @Roles('EMPLOYER')
  @ApiOperation({
    summary: 'Update payroll settings',
  })
  updateSettings(
    @Req() req: any,

    @Body()
    dto: UpdatePayrollSettingsDto,
  ) {
    return this.payrollService.updateSettings(req.user.userId, dto);
  }

  /**
   * Admin Payroll Processing
   *
   * Business Flow:
   * 1. Find all due repayments for employer.
   * 2. Mark repayments as PAID.
   * 3. Create Employer Settlement.
   * 4. Employees become eligible again.
   */
  @Post('process-recovery/:employerId')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Process payroll recovery and generate settlement',
  })
  processRecovery(
    @Param('employerId')
    employerId: string,

    @Req()
    req: any,
  ) {
    return this.payrollService.processRecovery(employerId, req.user.userId);
  }
}
