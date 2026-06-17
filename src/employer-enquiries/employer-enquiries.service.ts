import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateEmployerEnquiryDto } from './dto/create-employer-enquiry.dto';
import { EmailService } from 'src/email/email.service';

@Injectable()
export class EmployerEnquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async create(dto: CreateEmployerEnquiryDto) {
    const enquiry = await this.prisma.employerEnquiry.create({
      data: {
        companyName: dto.companyName,
        contactPerson: dto.contactPerson,
        email: dto.email,
        phone: dto.phone,
        employeeCount: dto.employeeCount,
      },
    });

    await this.emailService.sendEmployerEnquiryEmail({
      to: enquiry.email,
      companyName: enquiry.companyName,
      contactPerson: enquiry.contactPerson,
      employeeCount: enquiry.employeeCount ?? 0,
    });

    return enquiry;
  }

  async findAll() {
    return this.prisma.employerEnquiry.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
