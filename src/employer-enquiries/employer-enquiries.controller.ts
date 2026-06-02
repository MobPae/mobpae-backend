import { Body, Controller, Get, Post } from '@nestjs/common';

import { EmployerEnquiriesService } from './employer-enquiries.service';

import { CreateEmployerEnquiryDto } from './dto/create-employer-enquiry.dto';

@Controller('employer-enquiries')
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
  findAll() {
    return this.employerEnquiriesService.findAll();
  }
}
