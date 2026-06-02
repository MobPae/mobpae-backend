import { Body, Controller, Get, Post, Param } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  create(
    @Body()
    dto: CreateEmployeeDto,
  ) {
    return this.employeesService.create(dto);
  }

  @Get()
  findAll() {
    return this.employeesService.findAll();
  }

  @Get(':id/kyc-status')
  getKycStatus(@Param('id') id: string) {
    return this.employeesService.getKycStatus(id);
  }
}
