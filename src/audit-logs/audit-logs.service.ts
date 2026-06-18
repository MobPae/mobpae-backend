import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

export type AuditLogAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'TOKEN_REFRESH'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'PASSWORD_CHANGED'
  | 'EMPLOYER_ENQUIRY_CREATED'
  | 'EMPLOYER_ENQUIRY_ONBOARDED'
  | 'EMPLOYER_CREATED'
  | 'EMPLOYER_ACTIVATED'
  | 'EMPLOYER_SUSPENDED'
  | 'EMPLOYEE_CREATED'
  | 'EMPLOYEE_UPDATED'
  | 'SALARY_REQUEST_CREATED'
  | 'SALARY_REQUEST_APPROVED'
  | 'SALARY_REQUEST_REJECTED'
  | 'DISBURSAL_CREATED'
  | 'DISBURSAL_DISBURSED'
  | 'REPAYMENT_CREATED'
  | 'PAYROLL_RECOVERY_PROCESSED'
  | 'SETTLEMENT_GENERATED'
  | 'SETTLEMENT_PAID'
  | 'KYC_SUBMITTED'
  | 'KYC_APPROVED'
  | 'KYC_REJECTED'
  | 'BANK_SUBMITTED'
  | 'BANK_APPROVED'
  | 'BANK_REJECTED';

export type AuditEntityType =
  | 'AUTH'
  | 'EMPLOYER_ENQUIRY'
  | 'EMPLOYER'
  | 'EMPLOYEE'
  | 'SALARY_REQUEST'
  | 'DISBURSAL'
  | 'REPAYMENT'
  | 'PAYROLL'
  | 'SETTLEMENT'
  | 'KYC_DOCUMENT'
  | 'BANK_ACCOUNT';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async log(data: {
    userId?: string | null;
    action: AuditLogAction | string;
    entityType: AuditEntityType | string;
    entityId: string;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
  }) {
    const auditData: Prisma.AuditLogCreateInput = {
      user: data.userId
        ? {
            connect: {
              id: data.userId,
            },
          }
        : undefined,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      oldValue: data.oldValue as Prisma.InputJsonValue,
      newValue: data.newValue as Prisma.InputJsonValue,
    };

    try {
      await this.prisma.auditLog.create({
        data: auditData,
      });
    } catch (error) {
      console.error('Failed to write audit log', error);
    }
  }

  async logAuth(
    action:
      | 'LOGIN_SUCCESS'
      | 'LOGIN_FAILED'
      | 'LOGOUT'
      | 'TOKEN_REFRESH'
      | 'PASSWORD_RESET_REQUESTED'
      | 'PASSWORD_RESET_COMPLETED'
      | 'PASSWORD_CHANGED',
    data: {
      userId?: string;
      email?: string;
      ipAddress?: string;
      deviceInfo?: string;
      details?: Record<string, unknown>;
    },
  ) {
    await this.log({
      userId: data.userId,
      action,
      entityType: 'AUTH',
      entityId: data.userId ?? data.email ?? 'unknown',
      newValue: {
        email: data.email,
        ipAddress: data.ipAddress,
        deviceInfo: data.deviceInfo,
        timestamp: new Date().toISOString(),
        ...data.details,
      },
    });
  }

  async findAll(query: AuditLogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Prisma.AuditLogWhereInput = {
      action: query.action,
      entityType: query.entityType,
      userId: query.userId,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({
        where,
      }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const auditLog = await this.prisma.auditLog.findUnique({
      where: {
        id,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!auditLog) {
      throw new NotFoundException('Audit log not found');
    }

    return auditLog;
  }
}
