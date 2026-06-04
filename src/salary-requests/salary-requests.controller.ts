import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SalaryRequestsService } from './salary-requests.service';
import { CreateSalaryRequestDto } from './dto/create-salary-request.dto';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Salary Requests')
@ApiBearerAuth()
@Controller('salary-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalaryRequestsController {
  constructor(private readonly salaryRequestsService: SalaryRequestsService) {}

  @Post()
  @Roles('EMPLOYEE')
  create(
    @Body()
    dto: CreateSalaryRequestDto,
  ) {
    return this.salaryRequestsService.create(dto);
  }

  @Roles('ADMIN')
  @Get()
  @ApiOperation({
    summary: 'Get all salary requests for admin',
  })
  findAllForAdmin() {
    return this.salaryRequestsService.findAllForAdmin();
  }

  @Get('employee/:employeeId')
  @Roles('EMPLOYEE')
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.salaryRequestsService.findByEmployee(employeeId);
  }

  @Get('employer/:employerId/pending')
  @Roles('EMPLOYER')
  findPendingByEmployer(@Param('employerId') employerId: string) {
    return this.salaryRequestsService.findPendingByEmployer(employerId);
  }

  @Post(':id/approve')
  @Roles('EMPLOYER')
  approve(@Param('id') id: string) {
    return this.salaryRequestsService.approve(id);
  }
}
