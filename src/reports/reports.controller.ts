import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Get admin reporting dashboard metrics',
  })
  @ApiResponse({
    status: 200,
    description: 'Aggregated MVP reporting metrics',
    schema: {
      example: {
        totalEmployers: 12,
        activeEmployers: 10,
        suspendedEmployers: 1,
        totalEmployees: 250,
        activeEmployees: 230,
        pendingKyc: 18,
        pendingBankVerification: 7,
        pendingSalaryRequests: 5,
        approvedSalaryRequests: 3,
        disbursedSalaryRequests: 42,
        totalDisbursedAmount: 210000,
        totalRecoveredAmount: 180000,
        outstandingAmount: 30000,
        pendingSettlements: 2,
        platformFeeRevenue: 124750,
      },
    },
  })
  getDashboard() {
    return this.reportsService.getDashboardReport();
  }
}
