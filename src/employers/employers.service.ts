import { Injectable } from '@nestjs/common';
import { EmployerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { UpdateEmployerProfileDto } from './dto/update-employer-profile.dto';
import * as bcrypt from 'bcrypt';
import { CreateEmployerDto } from './dto/create-employer.dto';

@Injectable()
export class EmployersService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.employer.update({
      where: { id },
      data: {
        status,
      },
    });
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

    /**
     * Create Login User
     */
    const user = await this.prisma.user.create({
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
     * Admin approves onboarding.
     */
    const employer = await this.prisma.employer.create({
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

    /**
     * Create Employer Enquiry
     *
     * Keeps Employer Onboarding UI
     * as the single source of truth.
     */
    await this.prisma.employerEnquiry.create({
      data: {
        companyName: dto.companyName,
        contactPerson: dto.contactPerson,
        email: dto.email,
        phone: dto.phone,

        status: 'NEW',
      },
    });

    return {
      employerId: employer.id,
      loginEmail: user.email,
      temporaryPassword: defaultPassword,
      status: employer.status,
    };
  }
}
