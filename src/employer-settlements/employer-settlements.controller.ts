import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { EmployerSettlementsService } from './employer-settlements.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { MarkSettlementPaidDto } from './dto/mark-settlement-paid.dto';

@ApiTags('Employer Settlements')
@ApiBearerAuth()
@Controller('employer-settlements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployerSettlementsController {
  constructor(
    private readonly employerSettlementsService: EmployerSettlementsService,
  ) {}

  /**
   * Admin
   */
  @Get()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get all employer settlements',
  })
  findAll() {
    return this.employerSettlementsService.findAll();
  }

  /**
   * Employer
   */
  @Get('employer')
  @Roles('EMPLOYER')
  @ApiOperation({
    summary: 'Get employer settlements',
  })
  findByEmployer(@Req() req: any) {
    return this.employerSettlementsService.findByEmployer(req.user.userId);
  }

  @Get('employer/summary')
  @Roles('EMPLOYER')
  @ApiOperation({
    summary: 'Get employer settlement summary',
  })
  getSummary(@Req() req: any) {
    return this.employerSettlementsService.getSummary(req.user.userId);
  }

  /**
   * Admin
   */
  @Post('check-risk/:employerId')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Update employer risk status',
  })
  checkRisk(
    @Param('employerId')
    employerId: string,
  ) {
    return this.employerSettlementsService.updateEmployerRiskStatus(employerId);
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get settlement details',
  })
  findOne(
    @Param('id')
    id: string,
  ) {
    return this.employerSettlementsService.findOne(id);
  }

  /**
   * Admin
   */
  @Post(':id/send-report')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Send settlement report to employer',
  })
  sendReport(@Param('id') id: string) {
    return this.employerSettlementsService.sendReport(id);
  }

  @Post(':id/mark-paid')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Mark settlement as paid',
  })
  markPaid(
    @Param('id')
    id: string,

    @Body()
    dto: MarkSettlementPaidDto,
  ) {
    return this.employerSettlementsService.markPaid(id, dto.referenceNumber);
  }
}
