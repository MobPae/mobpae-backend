import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { SalaryLimitsService } from './salary-limits.service';

import { CreateSalaryLimitDto } from './dto/create-salary-limit.dto';

import { UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('salary-limits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalaryLimitsController {
  constructor(private readonly salaryLimitsService: SalaryLimitsService) {}

  @Post()
  @Roles('ADMIN')
  create(
    @Body()
    dto: CreateSalaryLimitDto,
  ) {
    return this.salaryLimitsService.create(dto);
  }

  @Get(':employeeId')
  @Roles('ADMIN', 'EMPLOYEE')
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.salaryLimitsService.findByEmployee(employeeId);
  }
}
