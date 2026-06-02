import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateEmployerEnquiryDto } from './dto/create-employer-enquiry.dto';
import { ApproveEmployerEnquiryDto } from './dto/approve-employer-enquiry.dto';

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

  async approve(id: string, dto: ApproveEmployerEnquiryDto) {
    const enquiry = await this.prisma.employerEnquiry.findUnique({
      where: { id },
    });

    if (!enquiry) {
      throw new Error('Enquiry not found');
    }

    const employer = await this.prisma.employer.create({
      data: {
        companyName: enquiry.companyName,
        contactPerson: enquiry.contactPerson,
        email: enquiry.email,
        phone: enquiry.phone,
        companyCode: dto.companyCode,
        payrollDate: dto.payrollDate,
        payrollCutoffDate: dto.payrollCutoffDate,
        status: 'ACTIVE',
      },
    });

    await this.prisma.employerEnquiry.update({
      where: { id },
      data: {
        status: 'APPROVED',
      },
    });

    return employer;
  }
}
