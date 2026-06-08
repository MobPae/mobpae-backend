// import { Body, Controller, Get, Param, Post } from '@nestjs/common';
// import { SalaryRequestsService } from './salary-requests.service';
// import { CreateSalaryRequestDto } from './dto/create-salary-request.dto';
// import { UseGuards } from '@nestjs/common';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { RolesGuard } from '../auth/guards/roles.guard';
// import { Roles } from '../auth/decorators/roles.decorator';
// import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

// @ApiTags('Salary Requests')
// @ApiBearerAuth()
// @Controller('salary-requests')
// @UseGuards(JwtAuthGuard, RolesGuard)
// export class SalaryRequestsController {
//   constructor(private readonly salaryRequestsService: SalaryRequestsService) {}

//   @Post()
//   @Roles('EMPLOYEE')
//   create(
//     @Body()
//     dto: CreateSalaryRequestDto,
//   ) {
//     return this.salaryRequestsService.create(dto);
//   }

//   @Roles('ADMIN')
//   @Get()
//   @ApiOperation({
//     summary: 'Get all salary requests for admin',
//   })
//   findAllForAdmin() {
//     return this.salaryRequestsService.findAllForAdmin();
//   }

//   @Get('employee/:employeeId')
//   @Roles('EMPLOYEE')
//   findByEmployee(@Param('employeeId') employeeId: string) {
//     return this.salaryRequestsService.findByEmployee(employeeId);
//   }

//   @Get('employer/:employerId/pending')
//   @Roles('EMPLOYER')
//   findPendingByEmployer(@Param('employerId') employerId: string) {
//     return this.salaryRequestsService.findPendingByEmployer(employerId);
//   }

//   @Post(':id/approve')
//   @Roles('EMPLOYER')
//   approve(@Param('id') id: string) {
//     return this.salaryRequestsService.approve(id);
//   }
// }

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
    @Body()
    dto: CreateSalaryRequestDto,
  ) {
    return this.salaryRequestsService.create(dto);
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
  ) {
    return this.salaryRequestsService.reject(id);
  }
}
