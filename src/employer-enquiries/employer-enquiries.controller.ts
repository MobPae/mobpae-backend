import { Body, Controller, Get, Post } from '@nestjs/common';
import { EmployerEnquiriesService } from './employer-enquiries.service';
import { CreateEmployerEnquiryDto } from './dto/create-employer-enquiry.dto';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { Param } from '@nestjs/common';
import { ApproveEmployerEnquiryDto } from './dto/approve-employer-enquiry.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Employer Enquiries')
@ApiBearerAuth()
@Controller('employer-enquiries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployerEnquiriesController {
  constructor(
    private readonly employerEnquiriesService: EmployerEnquiriesService,
  ) {}

  @Post()
  create(
    @Body()
    dto: CreateEmployerEnquiryDto,
  ) {
    return this.employerEnquiriesService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN)
  findAll() {
    return this.employerEnquiriesService.findAll();
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN)
  approve(@Param('id') id: string, @Body() dto: ApproveEmployerEnquiryDto) {
    return this.employerEnquiriesService.approve(id, dto);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN)
  reject(@Param('id') id: string) {
    return this.employerEnquiriesService.reject(id);
  }
}
