import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

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
   * Public
   * Employer enquiry from landing page
   */
  @Post()
  create(
    @Body()
    dto: CreateEmployerEnquiryDto,
  ) {
    return this.employerEnquiriesService.create(dto);
  }

  /**
   * Admin
   * View all employer enquiries
   */
  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'List employer enquiries with pagination, search, sorting, and filters',
  })
  findAll(@Query() query: EmployerEnquiryListQueryDto) {
    return this.employerEnquiriesService.findAll(query);
  }
}
