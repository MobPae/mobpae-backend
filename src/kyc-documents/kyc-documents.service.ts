import { KycDocument, KycDocumentType, KycStatus } from '@prisma/client';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { REQUIRED_KYC_DOCUMENTS } from '../common/constants/kyc.constants';
import { NotificationsService } from '../notifications/notifications.service';

import { CreateKycDocumentDto } from './dto/create-kyc-document.dto';

type KycAuditAction = 'KYC_SUBMITTED' | 'KYC_APPROVED' | 'KYC_REJECTED';

@Injectable()
export class KycDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
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

  async findGroupedByEmployee(filters: {
    employerId?: string;
    status?: KycStatus;
  }) {
    const employees = await this.prisma.employee.findMany({
      where: {
        ...(filters.employerId
          ? {
              employerId: filters.employerId,
            }
          : {}),
        ...(filters.status
          ? {
              OR: [
                {
                  kycDocuments: {
                    some: {
                      status: filters.status,
                    },
                  },
                },
                {
                  selfieStatus: filters.status,
                },
              ],
            }
          : {}),
      },
      include: {
        employer: true,
        kycDocuments: {
          orderBy: {
            updatedAt: 'desc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return employees.map((employee) => {
      const documents = this.buildEmployeeKycDocuments(employee.kycDocuments);
      const requiredDocuments = REQUIRED_KYC_DOCUMENTS.map(
        (type) => documents[type],
      );
      const selfieSubmitted = Boolean(employee.selfieUrl);
      const selfiePending = employee.selfieStatus === 'PENDING';
      const selfieVerified = employee.selfieStatus === 'VERIFIED';
      const selfieRejected = employee.selfieStatus === 'REJECTED';
      const submittedCount =
        requiredDocuments.filter(Boolean).length + (selfieSubmitted ? 1 : 0);
      const pendingCount =
        requiredDocuments.filter((document) => document?.status === 'PENDING')
          .length + (selfieSubmitted && selfiePending ? 1 : 0);
      const verifiedCount =
        requiredDocuments.filter((document) => document?.status === 'VERIFIED')
          .length + (selfieVerified ? 1 : 0);
      const rejectedCount =
        requiredDocuments.filter((document) => document?.status === 'REJECTED')
          .length + (selfieRejected ? 1 : 0);

      return {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        employeeName: employee.name,
        email: employee.email,
        phone: employee.phone,
        employerId: employee.employerId,
        companyName: employee.employer.companyName,
        overallStatus: this.getEmployeeKycOverallStatus({
          submittedCount,
          pendingCount,
          verifiedCount,
          rejectedCount,
        }),
        submittedCount,
        pendingCount,
        verifiedCount,
        rejectedCount,
        requiredCount: REQUIRED_KYC_DOCUMENTS.length + 1,
        documents: {
          ...documents,
          SELFIE: employee.selfieUrl
            ? {
                status: employee.selfieStatus,
                filePath: employee.selfieUrl,
                verifiedAt: employee.selfieVerifiedAt,
                updatedAt: employee.updatedAt,
              }
            : null,
        },
      };
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

    if (document.employee.userId) {
      await this.notificationsService.createSystemNotification(
        document.employee.userId,
        'KYC Approved',
        `${document.documentType} verification has been approved.`,
      );
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
      include: {
        employee: true,
      },
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

    if (existingDocument.employee.userId) {
      await this.notificationsService.createSystemNotification(
        existingDocument.employee.userId,
        'KYC Rejected',
        `${existingDocument.documentType} verification has been rejected. Please upload the document again.`,
      );
    }

    try {
      await this.emailService.sendKycRejectedEmail({
        to: existingDocument.employee.email,
        employeeName: existingDocument.employee.name,
        documentType: existingDocument.documentType,
      });
    } catch (err) {
      console.error('Failed to send KYC rejected email', err);
    }

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
    await this.auditLogsService.log({
      userId: data.userId,
      action: data.action,
      entityType: 'KYC_DOCUMENT',
      entityId: data.entityId,
      oldValue: data.oldValue,
      newValue: data.newValue,
    });
  }

  private buildEmployeeKycDocuments(documents: KycDocument[]) {
    return REQUIRED_KYC_DOCUMENTS.reduce(
      (acc, documentType) => {
        const document = documents.find(
          (item) => item.documentType === documentType,
        );

        acc[documentType] = document
          ? {
              id: document.id,
              status: document.status,
              filePath: document.filePath,
              verifiedAt: document.verifiedAt,
              updatedAt: document.updatedAt,
            }
          : null;

        return acc;
      },
      {} as Record<
        (typeof REQUIRED_KYC_DOCUMENTS)[number],
        {
          id: string;
          status: KycStatus;
          filePath: string;
          verifiedAt: Date | null;
          updatedAt: Date;
        } | null
      >,
    );
  }

  private getEmployeeKycOverallStatus(counts: {
    submittedCount: number;
    pendingCount: number;
    verifiedCount: number;
    rejectedCount: number;
  }) {
    if (counts.submittedCount === 0) {
      return 'NOT_SUBMITTED';
    }

    if (counts.verifiedCount === REQUIRED_KYC_DOCUMENTS.length + 1) {
      return 'VERIFIED';
    }

    if (counts.rejectedCount > 0) {
      return 'REJECTED';
    }

    if (counts.pendingCount > 0) {
      return 'PENDING';
    }

    return 'PARTIAL';
  }
}
