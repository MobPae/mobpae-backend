import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { SalaryLimitsService } from './salary-limits.service';

import { CreateSalaryLimitDto } from './dto/create-salary-limit.dto';

@Controller('salary-limits')
export class SalaryLimitsController {
  constructor(private readonly salaryLimitsService: SalaryLimitsService) {}

  @Post()
  create(
    @Body()
    dto: CreateSalaryLimitDto,
  ) {
    return this.salaryLimitsService.create(dto);
  }

  @Get(':employeeId')
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.salaryLimitsService.findByEmployee(employeeId);
  }
}
