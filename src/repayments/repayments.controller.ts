import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { RepaymentsService } from './repayments.service';

import { CreateRepaymentDto } from './dto/create-repayment.dto';

@Controller('repayments')
export class RepaymentsController {
  constructor(private readonly repaymentsService: RepaymentsService) {}

  @Post()
  create(
    @Body()
    dto: CreateRepaymentDto,
  ) {
    return this.repaymentsService.create(dto);
  }

  @Get('employee/:employeeId')
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.repaymentsService.findByEmployee(employeeId);
  }

  @Post(':id/pay')
  pay(@Param('id') id: string) {
    return this.repaymentsService.pay(id);
  }
}
