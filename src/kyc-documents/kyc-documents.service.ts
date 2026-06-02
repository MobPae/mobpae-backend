import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateKycDocumentDto } from './dto/create-kyc-document.dto';

@Injectable()
export class KycDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateKycDocumentDto) {
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
    return this.prisma.kycDocument.findMany({
      where: {
        status: 'PENDING',
      },
      include: {
        employee: true,
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
}
