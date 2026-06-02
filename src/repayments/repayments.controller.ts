import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RepaymentsService } from './repayments.service';
import { CreateRepaymentDto } from './dto/create-repayment.dto';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('repayments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RepaymentsController {
  constructor(private readonly repaymentsService: RepaymentsService) {}

  @Post()
  @Roles('ADMIN')
  create(
    @Body()
    dto: CreateRepaymentDto,
  ) {
    return this.repaymentsService.create(dto);
  }

  @Get('employee/:employeeId')
  @Roles('ADMIN', 'EMPLOYEE')
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.repaymentsService.findByEmployee(employeeId);
  }

  @Post(':id/pay')
  @Roles('ADMIN')
  pay(@Param('id') id: string) {
    return this.repaymentsService.pay(id);
  }
}
