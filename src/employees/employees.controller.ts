import { Body, Controller, Get, Post, Patch, Param, Req } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmployeeActivationDto } from './dto/update-employee-activation.dto';
import { BulkEmployeeActivationDto } from './dto/bulk-employee-activation.dto';

@ApiTags('Employees')
@ApiBearerAuth()
@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Roles('EMPLOYER')
  create(@Body() dto: CreateEmployeeDto, @Req() req: any) {
    return this.employeesService.create(dto, req.user.userId);
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

  @Post('bulk')
  @Roles('EMPLOYER')
  @ApiOperation({
    summary: 'Bulk upload employees',
  })
  bulkCreate(
    @Req() req: any,

    @Body()
    employees: CreateEmployeeDto[],
  ) {
    return this.employeesService.bulkCreate(req.user.userId, employees);
  }

  @Patch('bulk-activation')
  @Roles('EMPLOYER')
  bulkActivation(@Body() dto: BulkEmployeeActivationDto, @Req() req: any) {
    return this.employeesService.bulkActivation(
      dto.employeeIds,
      dto.appActivated,
      req.user.userId,
    );
  }

  @Patch(':id/activation')
  @Roles('EMPLOYER')
  updateActivation(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeActivationDto,
    @Req() req: any,
  ) {
    return this.employeesService.updateActivation(
      id,
      dto.appActivated,
      req.user.userId,
    );
  }

  @Patch(':id')
  @Roles('EMPLOYER')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @Req() req: any,
  ) {
    return this.employeesService.update(id, dto, req.user.userId);
  }
}
