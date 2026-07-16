import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { EmployerEnquiriesService } from './employer-enquiries.service';

import { CreateEmployerEnquiryDto } from './dto/create-employer-enquiry.dto';
import { EmployerEnquiryListQueryDto } from './dto/employer-enquiry-list-query.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { Role } from '../common/enums/role.enum';

@ApiTags('Employer Enquiries')
@Controller('employer-enquiries')
export class EmployerEnquiriesController {
  constructor(
    private readonly employerEnquiriesService: EmployerEnquiriesService,
  ) {}

  /**
   * Public — enquiry from landing page.
   * Strict limit to prevent spam from the website form.
   */
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  create(@Body() dto: CreateEmployerEnquiryDto) {
    return this.employerEnquiriesService.create(dto);
  }

  /**
   * Admin — list all enquiries
   */
  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'List employer enquiries with pagination, search, sorting, and filters',
  })
  findAll(@Query() query: EmployerEnquiryListQueryDto) {
    return this.employerEnquiriesService.findAll(query);
  }

  /**
   * Admin — update enquiry status (NEW → CONTACTED / REJECTED / ONBOARDED)
   */
  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update enquiry status (Admin)' })
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string; remarks?: string },
  ) {
    return this.employerEnquiriesService.updateStatus(id, body.status, body.remarks);
  }
}
