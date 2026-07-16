import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmployerProductConfigsService } from './employer-product-configs.service';
import { UpsertEmployerProductConfigDto } from './dto/upsert-employer-product-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EmployerPermissionGuard } from '../auth/guards/employer-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../auth/permissions';

// ── Admin: manage any employer's product config ──────────────────────────────

@ApiTags('Employer Product Configs')
@ApiBearerAuth()
@Controller('employers/:employerId/product-configs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployerProductConfigsController {
  constructor(private readonly service: EmployerProductConfigsService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all product configs for an employer (admin)' })
  findByEmployer(@Param('employerId') employerId: string) {
    return this.service.findByEmployer(employerId);
  }

  @Put(':productType')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Upsert product config for an employer — set advance amount override (admin)',
  })
  upsert(
    @Param('employerId') employerId: string,
    @Param('productType') productType: string,
    @Body() dto: UpsertEmployerProductConfigDto,
  ) {
    return this.service.upsert(employerId, productType.toUpperCase(), dto);
  }
}

// ── Employer: self-service — view and update own product config ───────────────

@ApiTags('Employer Product Configs')
@ApiBearerAuth()
@Controller('employers/my/product-configs')
@UseGuards(JwtAuthGuard, EmployerPermissionGuard)
export class EmployerSelfProductConfigsController {
  constructor(private readonly service: EmployerProductConfigsService) {}

  @Get()
  @RequirePermission(Permission.ORG_SETTINGS_VIEW)
  @ApiOperation({ summary: 'Get all product configs for the logged-in employer' })
  findMine(@Req() req: any) {
    return this.service.findByEmployerId(req.user.employerId);
  }

  @Get(':productType/rules')
  @ApiOperation({ summary: 'Get active eligibility + pricing rules for a product type (employer view)' })
  getActiveRules(@Param('productType') productType: string) {
    return this.service.findActiveRulesForProductType(productType.toUpperCase());
  }

  @Put(':productType')
  @RequirePermission(Permission.ORG_SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Update advance percentage override for the logged-in employer',
  })
  upsertMine(
    @Req() req: any,
    @Param('productType') productType: string,
    @Body() dto: Pick<UpsertEmployerProductConfigDto, 'maximumAdvancePercentageOverride'>,
  ) {
    return this.service.upsertByEmployerId(req.user.employerId, productType.toUpperCase(), dto);
  }
}
