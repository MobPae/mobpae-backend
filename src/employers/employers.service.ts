import { Injectable } from '@nestjs/common';
import { EmployerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
}
