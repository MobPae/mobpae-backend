import { Injectable } from '@nestjs/common';
import { EmployerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { UpdateEmployerProfileDto } from './dto/update-employer-profile.dto';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { CreateEmployerDto } from './dto/create-employer.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class EmployersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

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
      } catch (error) {
        console.error('Failed to send employer approved email', error);
      }
    }

    return updatedEmployer;
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

  async create(dto: CreateEmployerDto, actorUserId: string) {
    console.log('Create Employer DTO:', dto);

    if (!dto.email?.trim()) {
      throw new BadRequestException('Email is required');
    }

    const initialTemporaryPassword = this.generateTemporaryPassword();

    const hashedPassword = await bcrypt.hash(initialTemporaryPassword, 10);

    const { user, employer, temporaryPassword, created } =
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
                temporaryPassword: null,
                created: false,
              };
            }
          }

          const existingEmployer = await tx.employer.findUnique({
            where: {
              email: enquiry.email,
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

            return {
              user: null,
              employer: existingEmployer,
              temporaryPassword: null,
              created: false,
            };
          }
        }

        const existingUser = await tx.user.findUnique({
          where: {
            email: dto.email,
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
            email: dto.email,
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
            email: dto.email,
            phone: dto.phone,

            status: 'PENDING',

            payrollDate: dto.payrollDate ?? 28,
            payrollCutoffDate: dto.payrollCutoffDate ?? 22,

            riskStatus: 'GOOD',
          },
        });

        if (dto.employerEnquiryId) {
          await tx.employerEnquiry.update({
            where: {
              id: dto.employerEnquiryId,
            },
            data: {
              employerId: employer.id,
              status: 'ONBOARDED',
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
          temporaryPassword: initialTemporaryPassword,
          created: true,
        };
      });

    return {
      employerId: employer.id,
      loginEmail: user?.email ?? employer.email,
      temporaryPassword,
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

    try {
      await this.prisma.auditLog.create({
        data: auditData as any,
      });
    } catch (error) {
      console.error('Failed to write business audit log', error);
    }
  }

  private generateTemporaryPassword() {
    return `MobPae-${randomBytes(8).toString('hex')}!1`;
  }
}
