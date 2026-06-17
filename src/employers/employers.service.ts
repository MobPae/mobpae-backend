import { Injectable } from '@nestjs/common';
import { EmployerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { UpdateEmployerProfileDto } from './dto/update-employer-profile.dto';
import * as bcrypt from 'bcrypt';
import { CreateEmployerDto } from './dto/create-employer.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class EmployersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async findAll() {
    return this.prisma.employer.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.employer.findUnique({
      where: { id },
    });
  }

  async updateStatus(id: string, status: EmployerStatus) {
    const employer = await this.prisma.employer.findUnique({
      where: { id },
    });

    const updatedEmployer = await this.prisma.employer.update({
      where: { id },
      data: {
        status,
      },
    });

    if (employer?.status !== 'ACTIVE' && status === 'ACTIVE') {
      try {
        await this.emailService.sendEmployerApprovedEmail({
          to: updatedEmployer.email,
          companyName: updatedEmployer.companyName,
          loginEmail: updatedEmployer.email,
          temporaryPassword: 'MobPae@123',
          loginUrl:
            process.env.EMPLOYER_LOGIN_URL ??
            process.env.FRONTEND_URL ??
            'https://mobpae.com/login',
        });
      } catch (error) {
        console.error('Failed to send employer approved email', error);
      }
    }

    return updatedEmployer;
  }

  async getProfile(userId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!employer) {
      throw new BadRequestException('Employer not found');
    }

    return {
      id: employer.id,

      companyName: employer.companyName,
      companyCode: employer.companyCode,

      contactPerson: employer.contactPerson,
      contactEmail: employer.email,
      phone: employer.phone,

      loginEmail: employer.user.email,

      status: employer.status,
      createdAt: employer.createdAt,
    };
  }

  async updateProfile(userId: string, dto: UpdateEmployerProfileDto) {
    const employer = await this.prisma.employer.findUnique({
      where: {
        userId,
      },
    });

    if (!employer) {
      throw new BadRequestException('Employer not found');
    }

    await this.prisma.employer.update({
      where: {
        id: employer.id,
      },
      data: {
        companyName: dto.companyName,
        contactPerson: dto.contactPerson,
        email: dto.email,
        phone: dto.phone,
      },
    });

    return this.getProfile(userId);
  }

  async create(dto: CreateEmployerDto) {
    console.log('Create Employer DTO:', dto);

    if (!dto.email?.trim()) {
      throw new BadRequestException('Email is required');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (existingUser) {
      throw new BadRequestException('User already exists with this email');
    }

    const defaultPassword = 'MobPae@123';

    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    const { user, employer } = await this.prisma.$transaction(async (tx) => {
      if (dto.employerEnquiryId) {
        const enquiry = await tx.employerEnquiry.findUnique({
          where: {
            id: dto.employerEnquiryId,
          },
        });

        if (!enquiry) {
          throw new BadRequestException('Employer enquiry not found');
        }

        if (enquiry.employerId) {
          throw new BadRequestException(
            'Employer enquiry is already onboarded',
          );
        }
      }

      /**
       * Create Login User
       */
      const user = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          role: 'EMPLOYER',
          isActive: true,
        },
      });

      /**
       * Create Employer
       *
       * Employer remains PENDING until
       * Admin activates onboarding.
       */
      const employer = await tx.employer.create({
        data: {
          userId: user.id,

          companyName: dto.companyName,
          companyCode: dto.companyCode,

          contactPerson: dto.contactPerson,
          email: dto.email,
          phone: dto.phone,

          status: 'PENDING',

          payrollDate: dto.payrollDate ?? 28,
          payrollCutoffDate: dto.payrollCutoffDate ?? 22,

          riskStatus: 'GOOD',
        },
      });

      if (dto.employerEnquiryId) {
        await tx.employerEnquiry.update({
          where: {
            id: dto.employerEnquiryId,
          },
          data: {
            employerId: employer.id,
            status: 'ONBOARDED',
          },
        });
      }

      return {
        user,
        employer,
      };
    });

    return {
      employerId: employer.id,
      loginEmail: user.email,
      temporaryPassword: defaultPassword,
      status: employer.status,
    };
  }
}
