import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateEmployerEnquiryDto } from './dto/create-employer-enquiry.dto';
import { ApproveEmployerEnquiryDto } from './dto/approve-employer-enquiry.dto';
import * as bcrypt from 'bcrypt';
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

  /**
   * Approves an employer enquiry.
   */
  async approve(id: string, dto: ApproveEmployerEnquiryDto) {
    const enquiry = await this.prisma.employerEnquiry.findUnique({
      where: {
        id,
      },
    });

    if (!enquiry) {
      throw new Error('Enquiry not found');
    }

    const employer = await this.prisma.employer.findFirst({
      where: {
        email: enquiry.email,
      },
    });

    if (!employer) {
      throw new Error('Employer not found');
    }

    const updatedEmployer = await this.prisma.employer.update({
      where: {
        id: employer.id,
      },
      data: {
        companyCode: dto.companyCode ?? employer.companyCode,
        status: 'ACTIVE',
      },
    });

    await this.prisma.employerEnquiry.update({
      where: {
        id,
      },
      data: {
        status: 'APPROVED',
      },
    });

    return {
      employerId: updatedEmployer.id,
      companyName: updatedEmployer.companyName,
      status: updatedEmployer.status,
    };
  }

  async reject(id: string) {
    const enquiry = await this.prisma.employerEnquiry.findUnique({
      where: { id },
    });

    if (!enquiry) {
      throw new Error('Enquiry not found');
    }

    return this.prisma.employerEnquiry.update({
      where: { id },
      data: {
        status: 'REJECTED',
      },
    });
  }
}
