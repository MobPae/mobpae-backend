import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

import { CreateKycDocumentDto } from './dto/create-kyc-document.dto';

type KycAuditAction = 'KYC_SUBMITTED' | 'KYC_APPROVED' | 'KYC_REJECTED';

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
      const updatedDocument = await this.prisma.kycDocument.update({
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

      await this.writeAuditLog({
        userId,
        action: 'KYC_SUBMITTED',
        entityId: updatedDocument.id,
        oldValue: existingDocument,
        newValue: updatedDocument,
      });

      return updatedDocument;
    }

    const document = await this.prisma.kycDocument.create({
      data: {
        employeeId: employee.id,
        documentType: dto.documentType,
        filePath: dto.filePath,
        status: 'PENDING',
      },
    });

    await this.writeAuditLog({
      userId,
      action: 'KYC_SUBMITTED',
      entityId: document.id,
      newValue: document,
    });

    return document;
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

  async findPendingByEmployer() {
    const documents = await this.prisma.kycDocument.findMany({
      where: {
        status: 'PENDING',
      },
      select: {
        id: true,
        employee: {
          select: {
            employer: {
              select: {
                id: true,
                companyName: true,
              },
            },
          },
        },
      },
    });

    const grouped = new Map<
      string,
      { employerId: string; companyName: string; pendingCount: number }
    >();

    for (const document of documents) {
      const employer = document.employee.employer;
      const existing = grouped.get(employer.id);

      grouped.set(employer.id, {
        employerId: employer.id,
        companyName: employer.companyName,
        pendingCount: (existing?.pendingCount ?? 0) + 1,
      });
    }

    return [...grouped.values()].sort((a, b) =>
      a.companyName.localeCompare(b.companyName),
    );
  }

  async findPendingForEmployer(employerId: string) {
    return this.prisma.kycDocument.findMany({
      where: {
        status: 'PENDING',
        employee: {
          employerId,
        },
      },
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

  async verify(id: string, actorUserId?: string) {
    const verifiedAt = new Date();

    const existingDocument = await this.prisma.kycDocument.findUnique({
      where: { id },
    });

    if (!existingDocument) {
      throw new NotFoundException('KYC document not found');
    }

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

    await this.writeAuditLog({
      userId: actorUserId,
      action: 'KYC_APPROVED',
      entityId: document.id,
      oldValue: existingDocument,
      newValue: document,
    });

    return document;
  }

  async reject(id: string, actorUserId?: string) {
    const existingDocument = await this.prisma.kycDocument.findUnique({
      where: { id },
    });

    if (!existingDocument) {
      throw new NotFoundException('KYC document not found');
    }

    const document = await this.prisma.kycDocument.update({
      where: { id },
      data: {
        status: 'REJECTED',
      },
    });

    await this.writeAuditLog({
      userId: actorUserId,
      action: 'KYC_REJECTED',
      entityId: document.id,
      oldValue: existingDocument,
      newValue: document,
    });

    return document;
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

  private async writeAuditLog(data: {
    userId?: string;
    action: KycAuditAction;
    entityId: string;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: data.userId,
          action: data.action,
          entityType: 'KYC_DOCUMENT',
          entityId: data.entityId,
          oldValue: data.oldValue as any,
          newValue: data.newValue as any,
        },
      });
    } catch (error) {
      console.error('Failed to write KYC audit log', error);
    }
  }
}
