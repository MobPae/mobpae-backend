import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';

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
   * Admin
   * View repayments of any employee
   */
  @Get('employee/:employeeId')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get repayments by employee for Admin',
  })
  findByEmployee(
    @Param('employeeId')
    employeeId: string,
  ) {
    return this.repaymentsService.findByEmployee(employeeId);
  }

  /**
   * Employee
   * View own repayments
   */
  @Get('my')
  @Roles('EMPLOYEE')
  @ApiOperation({
    summary: 'Get my repayments',
  })
  getMyRepayments(@Req() req: any) {
    return this.repaymentsService.findByUserId(req.user.userId);
  }
}
