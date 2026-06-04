import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { DisbursalsService } from './disbursals.service';
import { CreateDisbursalDto } from './dto/create-disbursal.dto';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Disbursals')
@ApiBearerAuth()
@Controller('disbursals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DisbursalsController {
  constructor(private readonly disbursalsService: DisbursalsService) {}

  @Post()
  @Roles('ADMIN')
  create(
    @Body()
    dto: CreateDisbursalDto,
  ) {
    return this.disbursalsService.create(dto);
  }

  @Get()
  @Roles('ADMIN')
  findAll() {
    return this.disbursalsService.findAllForAdmin();
  }

  @Post(':id/disburse')
  @Roles('ADMIN')
  disburse(@Param('id') id: string) {
    return this.disbursalsService.disburse(id);
  }
}
