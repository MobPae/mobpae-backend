import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { RevenueReportQueryDto } from './dto/revenue-report-query.dto';
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

  @Get('revenue')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Get revenue report grouped by employer and employee',
    description:
      'Returns realized revenue from paid platform fees, paid repayment interest, and paid settlement late fees. Replaces the legacy membership revenue summary.',
  })
  @ApiQuery({
    name: 'employerId',
    required: false,
    description: 'Filter revenue for a single employer',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Inclusive start date. Accepts YYYY-MM-DD or ISO datetime.',
    example: '2026-07-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Inclusive end date. Accepts YYYY-MM-DD or ISO datetime.',
    example: '2026-07-31',
  })
  @ApiResponse({
    status: 200,
    description: 'Revenue summary grouped by employer and employee',
    schema: {
      example: {
        totalRevenue: 925,
        interestRevenue: 250,
        platformFeeRevenue: 350,
        lateFeeRevenue: 325,
        byEmployer: [
          {
            employerId: '2f8ed1f2-d5f7-4c5d-88e7-9f8f62b74c68',
            companyName: 'Northstar Retail Pvt Ltd',
            companyCode: 'NORTHSTAR',
            interestRevenue: 250,
            platformFeeRevenue: 350,
            lateFeeRevenue: 325,
            totalRevenue: 925,
            employeeCount: 3,
            employees: [
              {
                employeeId: '8c33a528-8e66-40c6-9236-2b1f81db380a',
                name: 'Arjun Sharma',
                employeeCode: 'EMP001',
                interestRevenue: 250,
                platformFeeRevenue: 175,
                lateFeeRevenue: 0,
                totalRevenue: 425,
              },
            ],
          },
        ],
      },
    },
  })
  getRevenue(@Query() query: RevenueReportQueryDto) {
    return this.reportsService.getRevenueReport(query);
  }
}
