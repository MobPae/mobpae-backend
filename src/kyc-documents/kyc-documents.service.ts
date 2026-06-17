import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

import { CreateKycDocumentDto } from './dto/create-kyc-document.dto';

@Injectable()
export class KycDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async create(userId: string, dto: CreateKycDocumentDto) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const existingDocument = await this.prisma.kycDocument.findFirst({
      where: {
        employeeId: employee.id,
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
        employeeId: employee.id,
        documentType: dto.documentType,
        filePath: dto.filePath,
        status: 'PENDING',
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
    const verifiedAt = new Date();

    const document = await this.prisma.kycDocument.update({
      where: { id },
      data: {
        status: 'VERIFIED',
        verifiedAt,
      },
      include: {
        employee: true,
      },
    });

    try {
      await this.emailService.sendKycApprovedEmail({
        to: document.employee.email,
        employeeName: document.employee.name,
        documentType: document.documentType,
        approvedDate: document.verifiedAt ?? verifiedAt,
      });
    } catch (error) {
      console.error('Failed to send KYC approved email', error);
    }

    return document;
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
