import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateKycDocumentDto } from './dto/create-kyc-document.dto';

@Injectable()
export class KycDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateKycDocumentDto) {
    const existingDocument = await this.prisma.kycDocument.findFirst({
      where: {
        employeeId: dto.employeeId,
        documentType: dto.documentType,
      },
    });

    if (existingDocument) {
      return this.prisma.kycDocument.update({
        where: {
          id: existingDocument.id,
        },
        data: {
          filePath: dto.filePath,
          status: 'PENDING',
          verifiedBy: null,
          verifiedAt: null,
        },
      });
    }

    return this.prisma.kycDocument.create({
      data: {
        employeeId: dto.employeeId,
        documentType: dto.documentType,
        filePath: dto.filePath,
      },
    });
  }

  async findByEmployee(employeeId: string) {
    return this.prisma.kycDocument.findMany({
      where: {
        employeeId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findPending() {
    return this.findAll('PENDING');
  }

  async findAll(status?: 'PENDING' | 'VERIFIED' | 'REJECTED') {
    return this.prisma.kycDocument.findMany({
      where: status ? { status } : undefined,
      include: {
        employee: {
          include: {
            employer: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async verify(id: string) {
    return this.prisma.kycDocument.update({
      where: { id },
      data: {
        status: 'VERIFIED',
        verifiedAt: new Date(),
      },
    });
  }

  async reject(id: string) {
    return this.prisma.kycDocument.update({
      where: { id },
      data: {
        status: 'REJECTED',
      },
    });
  }

  async findByUserId(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
    });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    return this.findByEmployee(employee.id);
  }
}
