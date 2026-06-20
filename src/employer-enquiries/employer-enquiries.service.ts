import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateEmployerEnquiryDto } from './dto/create-employer-enquiry.dto';
import { EmailService } from 'src/email/email.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  containsSearch,
  getOrderBy,
  getPagination,
  hasSearch,
  paginate,
} from '../common/utils/pagination.util';
import { EmployerEnquiryListQueryDto } from './dto/employer-enquiry-list-query.dto';

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

  async updateStatus(id: string, status: string, remarks?: string) {
    const updated = await this.prisma.employerEnquiry.update({
      where: { id },
      data: {
        status: status as any,
        ...(remarks !== undefined ? { remarks } : {}),
      },
    });

    // Only email for CONTACTED and REJECTED statuses
    if (status === 'CONTACTED' || status === 'REJECTED') {
      try {
        await this.emailService.sendEnquiryStatusUpdatedEmail({
          to: updated.email,
          companyName: updated.companyName,
          contactPerson: updated.contactPerson,
          status,
          remarks,
        });
      } catch (err) {
        console.error('Failed to send enquiry status updated email', err);
      }
    }

    return updated;
  }

  async findAll(query: EmployerEnquiryListQueryDto = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const where: any = {
      status: query.status,
      ...(hasSearch(query)
        ? {
            OR: [
              { companyName: containsSearch(query) },
              { contactPerson: containsSearch(query) },
              { email: containsSearch(query) },
              { phone: containsSearch(query) },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employerEnquiry.findMany({
        where,
        orderBy: getOrderBy(
          query,
          ['companyName', 'contactPerson', 'email', 'status', 'createdAt'],
          'createdAt',
        ),
        skip,
        take,
      }),
      this.prisma.employerEnquiry.count({
        where,
      }),
    ]);

    return paginate(data, total, page, limit);
  }
}
