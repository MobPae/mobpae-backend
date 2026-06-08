import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { DashboardService } from './dashboard.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

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
  @Get('employers/me')
  @Roles(Role.EMPLOYER)
  getMyEmployerDashboard(@Req() req: any) {
    return this.dashboardService.getEmployerDashboard(req.user.userId);
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
  ) {
    return this.dashboardService.getEmployeeDashboard(employeeId);
  }
}
