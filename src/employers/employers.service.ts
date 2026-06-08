import { Injectable } from '@nestjs/common';
import { EmployerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { UpdateEmployerProfileDto } from './dto/update-employer-profile.dto';

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
}
