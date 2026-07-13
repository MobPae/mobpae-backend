import { Injectable } from '@nestjs/common';
import { EmployerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { UpdateEmployerProfileDto } from './dto/update-employer-profile.dto';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { CreateEmployerDto } from './dto/create-employer.dto';
import { EmailService } from '../email/email.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  containsSearch,
  getOrderBy,
  getPagination,
  hasSearch,
  paginate,
} from '../common/utils/pagination.util';
import { EmployerListQueryDto } from './dto/employer-list-query.dto';
import { normalizeEmail } from '../common/utils/email.util';

@Injectable()
export class EmployersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async findAll(query: EmployerListQueryDto = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const where: any = {
      status: query.status,
      riskStatus: query.riskStatus,
      ...(hasSearch(query)
        ? {
            OR: [
              { companyName: containsSearch(query) },
              { companyCode: containsSearch(query) },
              { contactPerson: containsSearch(query) },
              { email: containsSearch(query) },
              { phone: containsSearch(query) },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employer.findMany({
        where,
        orderBy: getOrderBy(
          query,
          ['companyName', 'companyCode', 'status', 'riskStatus', 'createdAt'],
          'createdAt',
        ),
        skip,
        take,
      }),
      this.prisma.employer.count({
        where,
      }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(id: string) {
    return this.prisma.employer.findUnique({
      where: { id },
    });
  }

  async updateStatus(id: string, status: EmployerStatus, actorUserId: string) {
    const employer = await this.prisma.employer.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });

    const activationPassword =
      employer?.status !== 'ACTIVE' && status === 'ACTIVE'
        ? this.generateTemporaryPassword()
        : undefined;

    const updatedEmployer = await this.prisma.employer.update({
      where: { id },
      data: {
        status,
        ...(activationPassword
          ? {
              user: {
                update: {
                  password: await bcrypt.hash(activationPassword, 10),
                  passwordChanged: false,
                },
              },
            }
          : {}),
      },
    });

    if (employer?.status !== updatedEmployer.status) {
      await this.writeAuditLog({
        userId: actorUserId,
        action:
          updatedEmployer.status === 'ACTIVE'
            ? 'EMPLOYER_ACTIVATED'
            : updatedEmployer.status === 'SUSPENDED'
              ? 'EMPLOYER_SUSPENDED'
              : 'EMPLOYER_STATUS_UPDATED',
        entityType: 'EMPLOYER',
        entityId: updatedEmployer.id,
        oldValue: {
          status: employer?.status,
        },
        newValue: {
          status: updatedEmployer.status,
        },
      });
    }

    let emailDelivered: boolean | null = null;

    if (activationPassword) {
      try {
        await this.emailService.sendEmployerApprovedEmail({
          to: updatedEmployer.email,
          companyName: updatedEmployer.companyName,
          loginEmail: updatedEmployer.email,
          temporaryPassword: activationPassword,
          loginUrl:
            process.env.EMPLOYER_LOGIN_URL ??
            process.env.FRONTEND_URL ??
            'https://mobpae.com/login',
        });
        emailDelivered = true;
      } catch (error) {
        emailDelivered = false;
        console.error('Failed to send employer approved email', error);
      }
    }

    return {
      ...updatedEmployer,
      emailDelivered,
    };
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
        email: normalizeEmail(dto.email),
        phone: dto.phone,
      },
    });

    return this.getProfile(userId);
  }

  async create(dto: CreateEmployerDto, actorUserId: string) {
    if (!dto.email?.trim()) {
      throw new BadRequestException('Email is required');
    }

    const normalizedDto = {
      ...dto,
      email: normalizeEmail(dto.email),
    };

    const initialTemporaryPassword = this.generateTemporaryPassword();

    const hashedPassword = await bcrypt.hash(initialTemporaryPassword, 10);

    const { user, employer } =
      await this.prisma.$transaction(async (tx) => {
        let enquiry: Awaited<
          ReturnType<typeof tx.employerEnquiry.findUnique>
        > | null = null;

        if (dto.employerEnquiryId) {
          enquiry = await tx.employerEnquiry.findUnique({
            where: {
              id: dto.employerEnquiryId,
            },
          });

          if (!enquiry) {
            throw new BadRequestException('Employer enquiry not found');
          }

          if (enquiry.employerId) {
            const linkedEmployer = await tx.employer.findUnique({
              where: {
                id: enquiry.employerId,
              },
            });

            if (linkedEmployer) {
              return {
                user: null,
                employer: linkedEmployer,
              };
            }
          }

          const existingEmployer = await tx.employer.findUnique({
            where: {
              email: normalizeEmail(enquiry.email),
            },
          });

          if (existingEmployer) {
            await tx.employerEnquiry.update({
              where: {
                id: enquiry.id,
              },
              data: {
                employerId: existingEmployer.id,
                status: 'ONBOARDED',
              },
            });

            await tx.auditLog.create({
              data: {
                userId: actorUserId,
                action: 'EMPLOYER_ENQUIRY_ONBOARDED',
                entityType: 'EMPLOYER_ENQUIRY',
                entityId: enquiry.id,
                oldValue: {
                  status: enquiry.status,
                  employerId: enquiry.employerId,
                },
                newValue: {
                  status: 'ONBOARDED',
                  employerId: existingEmployer.id,
                },
              },
            });

            return {
              user: null,
              employer: existingEmployer,
            };
          }
        }

        const existingUser = await tx.user.findUnique({
          where: {
            email: normalizedDto.email,
          },
        });

        if (existingUser) {
          throw new BadRequestException('User already exists with this email');
        }

        /**
         * Create Login User
         */
        const user = await tx.user.create({
          data: {
            email: normalizedDto.email,
            password: hashedPassword,
            role: 'EMPLOYER',
            isActive: true,
            passwordChanged: false,
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
            email: normalizedDto.email,
            phone: dto.phone,

            status: 'PENDING',

            payrollDate: dto.payrollDate ?? 28,
            payrollCutoffDate: dto.payrollCutoffDate ?? 22,

            riskStatus: 'GOOD',
          },
        });

        if (dto.employerEnquiryId) {
          const updatedEnquiry = await tx.employerEnquiry.update({
            where: {
              id: dto.employerEnquiryId,
            },
            data: {
              employerId: employer.id,
              status: 'ONBOARDED',
            },
          });

          await tx.auditLog.create({
            data: {
              userId: actorUserId,
              action: 'EMPLOYER_ENQUIRY_ONBOARDED',
              entityType: 'EMPLOYER_ENQUIRY',
              entityId: updatedEnquiry.id,
              oldValue: {
                status: enquiry!.status,
                employerId: enquiry!.employerId,
              },
              newValue: {
                status: updatedEnquiry.status,
                employerId: updatedEnquiry.employerId,
              },
            },
          });
        }

        await tx.auditLog.create({
          data: {
            userId: actorUserId,
            action: 'EMPLOYER_CREATED',
            entityType: 'EMPLOYER',
            entityId: employer.id,
            newValue: {
              companyName: employer.companyName,
              companyCode: employer.companyCode,
              email: employer.email,
              status: employer.status,
              employerEnquiryId: dto.employerEnquiryId,
            },
          },
        });

        return {
          user,
          employer,
        };
      });

    return {
      employerId: employer.id,
      loginEmail: user?.email ?? employer.email,
      status: employer.status,
    };
  }

  private async writeAuditLog(data: {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
  }) {
    const auditData: {
      userId: string;
      action: string;
      entityType: string;
      entityId: string;
      oldValue?: Record<string, unknown>;
      newValue?: Record<string, unknown>;
    } = {
      userId: data.userId,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
    };

    if (data.oldValue !== null) {
      auditData.oldValue = data.oldValue;
    }

    if (data.newValue !== null) {
      auditData.newValue = data.newValue;
    }

    await this.auditLogsService.log(auditData);
  }

  private generateTemporaryPassword() {
    // bcrypt stores its own per-password salt; this extra random segment raises
    // temporary credential entropy before the password is hashed and emailed.
    const entropy = randomBytes(12).toString('base64url');
    const saltSegment = randomBytes(6).toString('base64url');

    return `MobPae-${entropy}-${saltSegment}!1`;
  }
}
