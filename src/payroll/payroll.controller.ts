import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PayrollService } from './payroll.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EmployerPermissionGuard } from '../auth/guards/employer-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../auth/permissions';

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
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.SETTLEMENT_VIEW)
  @ApiOperation({
    summary: 'Get payroll summary',
  })
  getSummary(@Req() req: any) {
    return this.payrollService.getSummary(req.user.employerId);
  }

  /**
   * Employer Recoveries
   */
  @Get('employer/recoveries')
  @Roles('EMPLOYER')
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.SETTLEMENT_VIEW)
  @ApiOperation({
    summary: 'Get payroll recoveries',
  })
  getRecoveries(@Req() req: any) {
    return this.payrollService.getRecoveries(req.user.employerId);
  }

  /**
   * Admin Recovery Settlement Generation
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
    summary: 'Generate recovery settlement for an employer',
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
