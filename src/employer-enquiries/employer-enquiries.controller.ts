import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { EmployerEnquiriesService } from './employer-enquiries.service';

import { CreateEmployerEnquiryDto } from './dto/create-employer-enquiry.dto';
import { ApproveEmployerEnquiryDto } from './dto/approve-employer-enquiry.dto';

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
  findAll() {
    return this.employerEnquiriesService.findAll();
  }

  /**
   * Admin
   * Approve employer enquiry
   */
  @Post(':id/approve')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  approve(
    @Param('id')
    id: string,

    @Body()
    dto: ApproveEmployerEnquiryDto,
  ) {
    return this.employerEnquiriesService.approve(id, dto);
  }

  /**
   * Admin
   * Reject employer enquiry
   */
  @Post(':id/reject')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  reject(
    @Param('id')
    id: string,
  ) {
    return this.employerEnquiriesService.reject(id);
  }
}
