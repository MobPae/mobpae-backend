import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { DisbursalsService } from './disbursals.service';

import { CreateDisbursalDto } from './dto/create-disbursal.dto';

@Controller('disbursals')
export class DisbursalsController {
  constructor(private readonly disbursalsService: DisbursalsService) {}

  @Post()
  create(
    @Body()
    dto: CreateDisbursalDto,
  ) {
    return this.disbursalsService.create(dto);
  }

  @Get()
  findAll() {
    return this.disbursalsService.findAll();
  }

  @Post(':id/disburse')
  disburse(@Param('id') id: string) {
    return this.disbursalsService.disburse(id);
  }
}
