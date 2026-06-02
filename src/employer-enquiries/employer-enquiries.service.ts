import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateEmployerEnquiryDto } from './dto/create-employer-enquiry.dto';

@Injectable()
export class EmployerEnquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEmployerEnquiryDto) {
    return this.prisma.employerEnquiry.create({
      data: {
        companyName: dto.companyName,
        contactPerson: dto.contactPerson,
        email: dto.email,
        phone: dto.phone,
        employeeCount: dto.employeeCount,
      },
    });
  }

  async findAll() {
    return this.prisma.employerEnquiry.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
