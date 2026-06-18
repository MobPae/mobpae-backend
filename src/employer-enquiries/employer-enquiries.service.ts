import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateEmployerEnquiryDto } from './dto/create-employer-enquiry.dto';
import { EmailService } from 'src/email/email.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class EmployerEnquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly auditLogsService: AuditLogsService,
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

    await this.auditLogsService.log({
      action: 'EMPLOYER_ENQUIRY_CREATED',
      entityType: 'EMPLOYER_ENQUIRY',
      entityId: enquiry.id,
      newValue: {
        companyName: enquiry.companyName,
        contactPerson: enquiry.contactPerson,
        email: enquiry.email,
        phone: enquiry.phone,
        employeeCount: enquiry.employeeCount,
        status: enquiry.status,
      },
    });

    try {
      await this.emailService.sendEmployerEnquiryEmail({
        to: enquiry.email,
        companyName: enquiry.companyName,
        contactPerson: enquiry.contactPerson,
        employeeCount: enquiry.employeeCount ?? 0,
      });
    } catch (error) {
      console.error('Failed to send employer enquiry email', error);
    }

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
