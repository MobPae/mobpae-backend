import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { DashboardService } from './dashboard.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EmployerPermissionGuard } from '../auth/guards/employer-permission.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../auth/permissions';

import { Role } from '../common/enums/role.enum';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Admin Dashboard
   */
  @Get('admin')
  @Roles(Role.ADMIN)
  getAdminDashboard() {
    return this.dashboardService.getAdminDashboard();
  }

  /**
   * Logged-in Employer Dashboard
   */
  @Get('employer')
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  getMyEmployerDashboard(@Req() req: any) {
    return this.dashboardService.getEmployerDashboard(req.user.employerId);
  }

  @Get('employer/trends')
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  getEmployerTrends(
    @Req() req: any,
    @Query('period') period = 'monthly',
  ) {
    return this.dashboardService.getEmployerTrends(req.user.employerId, period);
  }

  /**
   * Admin View of Specific Employer Dashboard
   */
  @Get('employers/:employerId')
  @Roles(Role.ADMIN)
  getEmployerDashboard(
    @Param('employerId')
    employerId: string,
  ) {
    return this.dashboardService.getEmployerDashboardByEmployerId(employerId);
  }

  /**
   * Employee Dashboard
   */
  @Get('employees/:employeeId')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  getEmployeeDashboard(
    @Param('employeeId')
    employeeId: string,
    @Req() req: any,
  ) {
    if (req.user.role === Role.EMPLOYEE && req.user.employeeId !== employeeId) {
      throw new ForbiddenException('You can only access your own dashboard');
    }

    return this.dashboardService.getEmployeeDashboard(employeeId);
  }
}
