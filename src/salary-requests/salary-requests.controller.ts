import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { SalaryRequestsService } from './salary-requests.service';

import { CreateSalaryRequestDto } from './dto/create-salary-request.dto';

@Controller('salary-requests')
export class SalaryRequestsController {
  constructor(private readonly salaryRequestsService: SalaryRequestsService) {}

  @Post()
  create(
    @Body()
    dto: CreateSalaryRequestDto,
  ) {
    return this.salaryRequestsService.create(dto);
  }

  @Get('employee/:employeeId')
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.salaryRequestsService.findByEmployee(employeeId);
  }

  @Get('employer/:employerId/pending')
  findPendingByEmployer(@Param('employerId') employerId: string) {
    return this.salaryRequestsService.findPendingByEmployer(employerId);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.salaryRequestsService.approve(id);
  }
}
