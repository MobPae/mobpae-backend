import { Body, Controller, Get, Post, Param } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';

import { UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Roles('EMPLOYER')
  create(
    @Body()
    dto: CreateEmployeeDto,
  ) {
    return this.employeesService.create(dto);
  }

  @Get()
  @Roles('ADMIN', 'EMPLOYER')
  findAll() {
    return this.employeesService.findAll();
  }

  @Get(':id/kyc-status')
  @Roles('ADMIN', 'EMPLOYEE')
  getKycStatus(@Param('id') id: string) {
    return this.employeesService.getKycStatus(id);
  }
}
