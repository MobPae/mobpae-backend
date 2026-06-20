import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RepaymentsService } from './repayments.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Repayments')
@ApiBearerAuth()
@Controller('repayments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RepaymentsController {
  constructor(private readonly repaymentsService: RepaymentsService) {}

  /**
   * Admin — list all repayments across all employees
   */
  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get all repayments (Admin)' })
  findAll() {
    return this.repaymentsService.findAllForAdmin();
  }

  /**
   * Employer — list repayments for their own employees
   */
  @Get('employer')
  @Roles('EMPLOYER')
  @ApiOperation({ summary: 'Get repayments for employer employees' })
  findForEmployer(@Req() req: any) {
    return this.repaymentsService.findAllForEmployer(req.user.userId);
  }

  /**
   * Admin — mark a repayment as paid
   */
  @Post(':id/pay')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Mark repayment as paid (Admin)' })
  pay(@Param('id') id: string) {
    return this.repaymentsService.pay(id);
  }

  /**
   * Admin — view repayments of a specific employee
   */
  @Get('employee/:employeeId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get repayments by employee (Admin)' })
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.repaymentsService.findByEmployee(employeeId);
  }

  /**
   * Employee — view own repayments
   */
  @Get('my')
  @Roles('EMPLOYEE')
  @ApiOperation({ summary: 'Get my repayments' })
  getMyRepayments(@Req() req: any) {
    return this.repaymentsService.findByUserId(req.user.userId);
  }
}
