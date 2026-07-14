import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { LoanApplicationsService } from './loan-applications.service';
import { BulkLoanApplicationActionDto } from './dto/bulk-loan-application-action.dto';
import { CancelLoanApplicationDto } from './dto/cancel-loan-application.dto';
import { CreateLoanApplicationDto } from './dto/create-loan-application.dto';
import { LoanApplicationListQueryDto } from './dto/loan-application-list-query.dto';
import { PreviewLoanApplicationDto } from './dto/preview-loan-application.dto';
import { RejectLoanApplicationDto } from './dto/reject-loan-application.dto';

@ApiTags('Loan Applications')
@ApiBearerAuth()
@Controller('loan-applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoanApplicationsController {
  constructor(private readonly service: LoanApplicationsService) {}

  // ── Employee ──────────────────────────────────────────────────────────────

  @Post()
  @Roles('EMPLOYEE')
  @ApiOperation({ summary: 'Submit a loan application' })
  create(@Req() req: any, @Body() dto: CreateLoanApplicationDto) {
    return this.service.create(req.user.userId, dto);
  }

  @Get('preview')
  @Roles('EMPLOYEE')
  @ApiOperation({ summary: 'Preview repayment for a given amount' })
  preview(@Req() req: any, @Query() query: PreviewLoanApplicationDto) {
    return this.service.preview(req.user.userId, query.amount);
  }

  @Get('eligibility')
  @Roles('EMPLOYEE')
  @ApiOperation({ summary: 'Check employee eligibility to apply' })
  getEligibility(@Req() req: any) {
    return this.service.getEligibility(req.user.userId);
  }

  @Get('my')
  @Roles('EMPLOYEE')
  @ApiOperation({ summary: 'Get own loan applications' })
  findMine(@Req() req: any) {
    return this.service.findByUserId(req.user.userId);
  }

  @Get('my/:id')
  @Roles('EMPLOYEE')
  @ApiOperation({ summary: 'Get own loan application by ID' })
  findMyOne(@Param('id') id: string, @Req() req: any) {
    return this.service.findMyOne(id, req.user.userId);
  }

  @Post('my/:id/cancel')
  @Roles('EMPLOYEE')
  @ApiOperation({ summary: 'Cancel own submitted application' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelLoanApplicationDto,
    @Req() req: any,
  ) {
    return this.service.cancel(id, req.user.userId, dto.remarks);
  }

  // ── Employer ──────────────────────────────────────────────────────────────

  @Get('employer')
  @Roles('EMPLOYER')
  @ApiOperation({ summary: "List employer's loan applications" })
  findAllForEmployer(@Req() req: any) {
    return this.service.findAllForEmployer(req.user.userId);
  }

  @Get('employer/pending')
  @Roles('EMPLOYER')
  @ApiOperation({
    summary: 'List pending applications awaiting employer action',
  })
  findPendingByEmployer(@Req() req: any) {
    return this.service.findPendingByEmployer(req.user.userId);
  }

  @Post(':id/employer-approve')
  @Roles('EMPLOYER')
  @ApiOperation({ summary: 'Employer approves a loan application' })
  employerApprove(@Param('id') id: string, @Req() req: any) {
    return this.service.employerApprove(id, req.user.userId);
  }

  @Post(':id/employer-reject')
  @Roles('EMPLOYER')
  @ApiOperation({ summary: 'Employer rejects a loan application' })
  employerReject(
    @Param('id') id: string,
    @Body() dto: RejectLoanApplicationDto,
    @Req() req: any,
  ) {
    return this.service.employerReject(id, dto, req.user.userId);
  }

  @Post('bulk-action')
  @Roles('EMPLOYER')
  @ApiOperation({ summary: 'Bulk approve or reject applications' })
  bulkAction(@Body() dto: BulkLoanApplicationActionDto, @Req() req: any) {
    return this.service.bulkAction(dto, req.user.userId);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: list all loan applications (paginated)' })
  findAllForAdmin(@Query() query: LoanApplicationListQueryDto) {
    return this.service.findAllForAdmin(query);
  }

  @Get('employee/:employeeId')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Admin: list loan applications for a specific employee',
  })
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.service.findByEmployee(employeeId);
  }

  @Get(':id/history')
  @Roles('ADMIN', 'EMPLOYER', 'EMPLOYEE')
  @ApiOperation({ summary: 'Get loan application lifecycle history' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        history: [
          {
            id: 'history-id',
            status: 'AWAITING_PLATFORM_FEE_PAYMENT',
            previousStatus: 'SUBMITTED',
            actorType: 'EMPLOYER',
            actorName: 'Rohan Mehta',
            actorId: null,
            note: 'Employer approved. Platform fee payment required.',
            createdAt: '2026-07-10T14:22:00.000Z',
          },
        ],
      },
    },
  })
  findHistory(@Param('id') id: string, @Req() req: any) {
    return this.service.findHistory(id, req.user);
  }

  @Get(':id')
  @Roles('ADMIN', 'EMPLOYER')
  @ApiOperation({ summary: 'Get loan application details' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.service.findOne(id, req.user);
  }

  @Post(':id/admin-approve')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin approves a loan application' })
  adminApprove(@Param('id') id: string, @Req() req: any) {
    return this.service.adminApprove(id, req.user.userId);
  }

  @Post(':id/admin-reject')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin rejects a loan application' })
  adminReject(
    @Param('id') id: string,
    @Body() dto: RejectLoanApplicationDto,
    @Req() req: any,
  ) {
    return this.service.adminReject(id, dto, req.user.userId);
  }
}
