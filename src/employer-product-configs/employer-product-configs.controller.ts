import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmployerProductConfigsService } from './employer-product-configs.service';
import { UpsertEmployerProductConfigDto } from './dto/upsert-employer-product-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Employer Product Configs')
@ApiBearerAuth()
@Controller('employers/:employerId/product-configs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployerProductConfigsController {
  constructor(
    private readonly service: EmployerProductConfigsService,
  ) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all product configs for an employer' })
  findByEmployer(@Param('employerId') employerId: string) {
    return this.service.findByEmployer(employerId);
  }

  @Put(':productType')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Upsert product config for an employer (set advance % override, approval requirements)',
  })
  upsert(
    @Param('employerId') employerId: string,
    @Param('productType') productType: string,
    @Body() dto: UpsertEmployerProductConfigDto,
  ) {
    return this.service.upsert(employerId, productType.toUpperCase(), dto);
  }
}
