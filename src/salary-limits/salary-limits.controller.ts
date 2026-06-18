import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { SalaryLimitsService } from './salary-limits.service';
import { CreateSalaryLimitDto } from './dto/create-salary-limit.dto';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Salary Limits')
@ApiBearerAuth()
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
  findByEmployee(@Param('employeeId') employeeId: string, @Req() req: any) {
    if (req.user.role === 'EMPLOYEE' && req.user.employeeId !== employeeId) {
      throw new ForbiddenException('You can only access your own salary limit');
    }

    return this.salaryLimitsService.findByEmployee(employeeId);
  }
}
