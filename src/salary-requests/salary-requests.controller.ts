import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SalaryRequestsService } from './salary-requests.service';
import { CreateSalaryRequestDto } from './dto/create-salary-request.dto';
import { RejectSalaryRequestDto } from './dto/reject-salary-request.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { PreviewSalaryRequestDto } from './dto/preview-salary-request.dto';

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
    @Body()
    dto: CreateSalaryRequestDto,
  ) {
    return this.salaryRequestsService.create(dto);
  }

  @Post('preview')
  @Roles('EMPLOYEE')
  @ApiOperation({
    summary: 'Preview salary advance repayment',
  })
  preview(@Req() req: any, @Body() dto: PreviewSalaryRequestDto) {
    return this.salaryRequestsService.preview(req.user.userId, dto.amount);
  }

  /**
   * Admin - View all requests
   */
  @Get()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get all salary requests',
  })
  findAllForAdmin() {
    return this.salaryRequestsService.findAllForAdmin();
  }

  /**
   * Employee - View own requests
   */
  @Get('employee/:employeeId')
  @Roles('EMPLOYEE')
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
   * Employer - View all requests for their company
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
   * Employer Dashboard - Pending Requests
   */
  @Get('employer/pending')
  @Roles('EMPLOYER')
  @ApiOperation({
    summary: 'Get pending salary requests for employer',
  })
  findPendingByEmployer(@Req() req: any) {
    return this.salaryRequestsService.findPendingByEmployer(req.user.userId);
  }

  @Get(':id')
  @Roles('ADMIN', 'EMPLOYER')
  @ApiOperation({
    summary: 'Get salary request details',
  })
  findOne(
    @Param('id')
    id: string,
  ) {
    return this.salaryRequestsService.findOne(id);
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
  ) {
    return this.salaryRequestsService.approve(id);
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
  ) {
    return this.salaryRequestsService.reject(id, dto.remarks);
  }
}
