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

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SalaryRequestsService } from './salary-requests.service';

import { CreateSalaryRequestDto } from './dto/create-salary-request.dto';
import { RejectSalaryRequestDto } from './dto/reject-salary-request.dto';
import { PreviewSalaryRequestDto } from './dto/preview-salary-request.dto';
import { SalaryRequestListQueryDto } from './dto/salary-request-list-query.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Salary Requests')
@ApiBearerAuth()
@Controller('salary-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalaryRequestsController {
  constructor(private readonly salaryRequestsService: SalaryRequestsService) {}

  /**
   * Employee creates salary advance request
   */
  @Post()
  @Roles('EMPLOYEE')
  @ApiOperation({
    summary: 'Create salary request',
  })
  create(
    @Req() req: any,
    @Body()
    dto: CreateSalaryRequestDto,
  ) {
    return this.salaryRequestsService.create(req.user.userId, dto);
  }

  /**
   * Employee repayment preview
   */
  @Post('preview')
  @Roles('EMPLOYEE')
  @ApiOperation({
    summary: 'Preview salary advance repayment',
  })
  preview(@Req() req: any, @Body() dto: PreviewSalaryRequestDto) {
    return this.salaryRequestsService.preview(req.user.userId, dto.amount);
  }

  /**
   * Employee - View own requests
   */
  @Get('my')
  @Roles('EMPLOYEE')
  @ApiOperation({
    summary: 'Get my salary requests',
  })
  findMyRequests(@Req() req: any) {
    return this.salaryRequestsService.findByUserId(req.user.userId);
  }

  /**
   * Employer - View all requests for company
   */
  @Get('employer')
  @Roles('EMPLOYER')
  @ApiOperation({
    summary: 'Get all salary requests for employer',
  })
  findAllForEmployer(@Req() req: any) {
    return this.salaryRequestsService.findAllForEmployer(req.user.userId);
  }

  /**
   * Employer - Pending requests
   */
  @Get('employer/pending')
  @Roles('EMPLOYER')
  @ApiOperation({
    summary: 'Get pending salary requests for employer',
  })
  findPendingByEmployer(@Req() req: any) {
    return this.salaryRequestsService.findPendingByEmployer(req.user.userId);
  }

  /**
   * Admin - Requests for a specific employee
   */
  @Get('employee/:employeeId')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get salary requests by employee',
  })
  findByEmployee(
    @Param('employeeId')
    employeeId: string,
  ) {
    return this.salaryRequestsService.findByEmployee(employeeId);
  }

  /**
   * Admin - All requests
   */
  @Get()
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'List salary requests with pagination, search, sorting, and filters',
  })
  findAllForAdmin(@Query() query: SalaryRequestListQueryDto) {
    return this.salaryRequestsService.findAllForAdmin(query);
  }

  /**
   * Request Details
   */
  @Get(':id')
  @Roles('ADMIN', 'EMPLOYER')
  @ApiOperation({
    summary: 'Get salary request details',
  })
  findOne(
    @Param('id')
    id: string,

    @Req()
    req: any,
  ) {
    return this.salaryRequestsService.findOne(id, req.user);
  }

  /**
   * Employer approves request
   */
  @Post(':id/approve')
  @Roles('EMPLOYER')
  @ApiOperation({
    summary: 'Approve salary request',
  })
  approve(
    @Param('id')
    id: string,

    @Req()
    req: any,
  ) {
    return this.salaryRequestsService.approve(id, req.user.userId);
  }

  /**
   * Employer rejects request
   */
  @Post(':id/reject')
  @Roles('EMPLOYER')
  @ApiOperation({
    summary: 'Reject salary request',
  })
  reject(
    @Param('id')
    id: string,

    @Body()
    dto: RejectSalaryRequestDto,

    @Req()
    req: any,
  ) {
    return this.salaryRequestsService.reject(id, dto.remarks, req.user.userId);
  }
}
