import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateEmployerEnquiryDto } from './dto/create-employer-enquiry.dto';
import { ApproveEmployerEnquiryDto } from './dto/approve-employer-enquiry.dto';
import * as bcrypt from 'bcrypt';

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

  /**
   * Approves an employer enquiry.
   *
   * Business Flow:
   * 1. Validate enquiry exists.
   * 2. Create Employer record.
   * 3. Create Employer User account.
   * 4. Assign default password.
   * 5. Mark enquiry as APPROVED.
   *
   * Result: Employer can login and start onboarding employees.
   */
  async approve(id: string, dto: ApproveEmployerEnquiryDto) {
    const enquiry = await this.prisma.employerEnquiry.findUnique({
      where: { id },
    });

    if (!enquiry) {
      throw new Error('Enquiry not found');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: enquiry.email,
      },
    });

    if (existingUser) {
      throw new Error('User already exists');
    }

    const defaultPassword = 'MobPae@123';

    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    const user = await this.prisma.user.create({
      data: {
        email: enquiry.email,
        password: hashedPassword,
        role: 'EMPLOYER',
        isActive: true,
      },
    });

    const employer = await this.prisma.employer.create({
      data: {
        userId: user.id,

        companyName: enquiry.companyName,
        contactPerson: enquiry.contactPerson,
        email: enquiry.email,
        phone: enquiry.phone,

        companyCode: dto.companyCode,

        payrollDate: 28,
        payrollCutoffDate: 21,

        status: 'ACTIVE',
      },
    });

    await this.prisma.employerEnquiry.update({
      where: { id },
      data: {
        status: 'APPROVED',
      },
    });

    return {
      employer,
      credentials: {
        email: enquiry.email,
        password: defaultPassword,
      },
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
