import { Controller, Get, Param } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('admin')
  @Roles('ADMIN')
  getAdminDashboard() {
    return this.dashboardService.getAdminDashboard();
  }

  @Get('employer/:employerId')
  @Roles('ADMIN', 'EMPLOYER')
  getEmployerDashboard(@Param('employerId') employerId: string) {
    return this.dashboardService.getEmployerDashboard(employerId);
  }

  @Get('employee/:employeeId')
  @Roles('ADMIN', 'EMPLOYEE')
  getEmployeeDashboard(@Param('employeeId') employeeId: string) {
    return this.dashboardService.getEmployeeDashboard(employeeId);
  }
}
