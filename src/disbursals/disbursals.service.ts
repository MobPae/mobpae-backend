import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { CreateDisbursalDto } from './dto/create-disbursal.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { DisbursalListQueryDto } from './dto/disbursal-list-query.dto';
import { PlatformFeesService } from '../platform-fees/platform-fees.service';

@Injectable()
export class DisbursalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
    private readonly auditLogsService: AuditLogsService,
    private readonly platformFeesService: PlatformFeesService,
  ) {}

  async create(dto: CreateDisbursalDto, actorUserId: string) {
    const loanApplication = await this.prisma.loanApplication.findUnique({
      where: { id: dto.loanApplicationId },
    });

    if (!loanApplication) {
      throw new BadRequestException('Loan application not found');
    }

    const existingDisbursal = await this.prisma.disbursal.findUnique({
      where: { loanApplicationId: loanApplication.id },
    });

    if (existingDisbursal) {
      return existingDisbursal;
    }

    const employer = await this.prisma.employer.findUnique({
      where: { id: loanApplication.employerId },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    if (employer.riskStatus === 'BLOCKED') {
      throw new BadRequestException(
        'Employer has overdue settlements. Please clear outstanding dues before further disbursals.',
      );
    }

    if (loanApplication.status !== 'READY_FOR_DISBURSAL') {
      throw new BadRequestException(
        'Loan application is not ready for disbursal. Employer and admin approval are required.',
      );
    }

    // Guard: salary advance requires the request-specific platform fee to be
    // cleared after employer approval. Memberships remain available for future
    // products but no longer gate salary advance disbursal.
    const feeCleared = await this.platformFeesService.isFeeCleared(
      loanApplication.id,
    );
    if (!feeCleared) {
      throw new BadRequestException(
        'Platform fee must be paid before disbursal.',
      );
    }

    const requestedAmount = Number(loanApplication.requestedAmount);
    const approvedAmount = Number(
      loanApplication.adminApprovedAmount ?? loanApplication.requestedAmount,
    );

    const disbursal = await this.prisma.disbursal.upsert({
      where: { loanApplicationId: loanApplication.id },
      update: {},
      create: {
        loanApplicationId: loanApplication.id,
        requestedAmount,
        approvedAmount,
        disbursedAmount: approvedAmount,
        initiatedBy: actorUserId,
      },
    });

    await this.writeAuditLog({
      userId: actorUserId,
      action: 'DISBURSAL_CREATED',
      entityType: 'DISBURSAL',
      entityId: disbursal.id,
      oldValue: null,
      newValue: this.disbursalAuditValue(disbursal),
    });

    return disbursal;
  }

  async findAllForAdmin(query: DisbursalListQueryDto = {}) {
    return this.prisma.disbursal.findMany({
      where: {
        status: query.status,
        createdAt:
          query.startDate || query.endDate
            ? {
                gte: query.startDate ? new Date(query.startDate) : undefined,
                lte: query.endDate ? new Date(query.endDate) : undefined,
              }
            : undefined,
        loanApplication:
          query.employerId || query.employeeId
            ? {
                employerId: query.employerId,
                employeeId: query.employeeId,
              }
            : undefined,
      },
      include: {
        loanApplication: {
          include: {
            employee: {
              include: {
                employer: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Marks a loan advance as disbursed (SUCCESS).
   *
   * Flow:
   * 1. Validate disbursal is PENDING.
   * 2. Validate employer is not BLOCKED.
   * 3. Mark SUCCESS + freeze bank account snapshot.
   * 4. Create Repayment using SNAPSHOT rates + disbursedAmount.
   * 5. Transition LoanApplication → REPAYMENT_SCHEDULED.
   * 6. Notify employee.
   */
  async disburse(id: string, actorUserId: string) {
    const existingDisbursal = await this.prisma.disbursal.findUnique({
      where: { id },
    });

    if (!existingDisbursal) {
      throw new NotFoundException('Disbursal not found');
    }

    if (existingDisbursal.status !== 'PENDING') {
      if (existingDisbursal.status === 'SUCCESS') {
        return existingDisbursal;
      }
      throw new BadRequestException('Disbursal is not pending');
    }

    const loanApplication = await this.prisma.loanApplication.findUnique({
      where: { id: existingDisbursal.loanApplicationId },
      include: {
        employee: {
          include: { bankAccount: true },
        },
        employer: true,
      },
    });

    if (!loanApplication) {
      throw new NotFoundException('Loan application not found');
    }

    if (loanApplication.employer.riskStatus === 'BLOCKED') {
      throw new BadRequestException(
        'Employer has overdue settlements. Please clear outstanding dues before further disbursals.',
      );
    }

    const feeCleared = await this.platformFeesService.isFeeCleared(
      loanApplication.id,
    );
    if (!feeCleared) {
      throw new BadRequestException(
        'Platform fee must be paid before disbursal.',
      );
    }

    const disbursedAmount = Number(
      existingDisbursal.disbursedAmount ?? existingDisbursal.approvedAmount,
    );

    // ── Repayment calculation using SNAPSHOT rates ───────────────────────────
    const annualInterestRate = Number(
      loanApplication.snapshotAnnualInterestRate,
    );
    const interestDays = loanApplication.snapshotInterestDays ?? 0;
    const dueDate = loanApplication.snapshotRecoveryDate;

    const {
      interestFreeAmount,
      interestBearingAmount,
      interestAmount,
      processingFee,
      gstAmount,
      totalAmount,
    } = this.pricingService.computeRepaymentBreakdown(disbursedAmount, {
      snapshotAnnualInterestRate: annualInterestRate,
      snapshotInterestFreeThreshold: Number(
        loanApplication.snapshotInterestFreeThreshold,
      ),
      snapshotProcessingFeeRate: Number(
        loanApplication.snapshotProcessingFeeRate,
      ),
      snapshotGstRate: Number(loanApplication.snapshotGstRate),
      snapshotInterestDays: interestDays,
    });
    // ────────────────────────────────────────────────────────────────────────

    // Freeze bank account at disbursal time
    const bankAccount = loanApplication.employee.bankAccount;
    if (!bankAccount?.verified) {
      throw new BadRequestException(
        'Verified bank account is required before disbursal',
      );
    }

    const { disbursal, repayment, repaymentCreated, transitioned } =
      await this.prisma.$transaction(async (tx) => {
        const claim = await tx.disbursal.updateMany({
          where: { id, status: 'PENDING' },
          data: {
            status: 'SUCCESS',
            completedAt: new Date(),
            disbursedBy: actorUserId,
            disbursedAmount,
            // Freeze bank account snapshot
            disbursalAccountNumber: bankAccount?.accountNumber ?? null,
            disbursalIfscCode: bankAccount?.ifscCode ?? null,
            disbursalBankName: bankAccount?.bankName ?? null,
            disbursalAccountHolderName: bankAccount?.accountHolderName ?? null,
          },
        });

        if (claim.count === 0) {
          const [disbursal, repayment] = await Promise.all([
            tx.disbursal.findUnique({ where: { id } }),
            tx.repayment.findUnique({
              where: { loanApplicationId: loanApplication.id },
            }),
          ]);

          if (!disbursal) throw new NotFoundException('Disbursal not found');

          return {
            disbursal,
            repayment,
            repaymentCreated: false,
            transitioned: false,
          };
        }

        let repayment = await tx.repayment.findUnique({
          where: { loanApplicationId: loanApplication.id },
        });

        let repaymentCreated = false;

        if (!repayment) {
          repayment = await tx.repayment.create({
            data: {
              loanApplicationId: loanApplication.id,
              principalAmount: disbursedAmount,
              interestFreeAmount,
              interestBearingAmount,
              interestAmount,
              processingFee,
              gstAmount,
              totalAmount,
              interestRate: annualInterestRate,
              interestDays,
              dueDate,
              status: 'SCHEDULED',
            },
          });
          repaymentCreated = true;
        }

        const disbursal = await tx.disbursal.findUnique({ where: { id } });
        if (!disbursal) throw new NotFoundException('Disbursal not found');

        await tx.loanApplication.update({
          where: { id: disbursal.loanApplicationId },
          data: { status: 'REPAYMENT_SCHEDULED' },
        });

        await tx.loanApplicationHistory.create({
          data: {
            loanApplicationId: disbursal.loanApplicationId,
            previousStatus: loanApplication.status,
            newStatus: 'REPAYMENT_SCHEDULED',
            changedBy: actorUserId,
            actorRole: 'ADMIN',
            remarks: 'Disbursal completed and repayment scheduled',
          },
        });

        return { disbursal, repayment, repaymentCreated, transitioned: true };
      });

    if (!transitioned) {
      return disbursal;
    }

    if (loanApplication.employee.userId) {
      await this.notificationsService.createSystemNotification(
        loanApplication.employee.userId,
        'Salary Advance Disbursed',
        `₹${disbursedAmount} has been disbursed to your registered bank account.`,
      );
    }

    if (repaymentCreated && repayment) {
      await this.writeAuditLog({
        userId: actorUserId,
        action: 'REPAYMENT_CREATED',
        entityType: 'REPAYMENT',
        entityId: repayment.id,
        oldValue: null,
        newValue: this.repaymentAuditValue(repayment),
      });
    }

    await this.writeAuditLog({
      userId: actorUserId,
      action: 'DISBURSAL_SUCCESS',
      entityType: 'DISBURSAL',
      entityId: disbursal!.id,
      oldValue: this.disbursalAuditValue(existingDisbursal),
      newValue: this.disbursalAuditValue(disbursal!),
    });

    try {
      await this.emailService.sendDisbursalSuccessfulEmail({
        to: loanApplication.employee.email,
        employeeName: loanApplication.employee.name,
        disbursedAmount,
        disbursalDate: disbursal!.completedAt ?? new Date(),
        repaymentDate: repayment?.dueDate,
      });
    } catch (error) {
      console.error('Failed to send disbursal email', error);
    }

    return disbursal;
  }

  private disbursalAuditValue(disbursal: {
    id: string;
    loanApplicationId: string;
    disbursedAmount: unknown;
    status: string;
    completedAt?: Date | null;
  }) {
    return {
      id: disbursal.id,
      loanApplicationId: disbursal.loanApplicationId,
      disbursedAmount: Number(disbursal.disbursedAmount),
      status: disbursal.status,
      completedAt: disbursal.completedAt?.toISOString() ?? null,
    };
  }

  private repaymentAuditValue(repayment: {
    id: string;
    loanApplicationId: string;
    principalAmount: unknown;
    interestAmount: unknown;
    totalAmount: unknown;
    interestRate: unknown;
    interestDays: number;
    dueDate: Date;
    status: string;
  }) {
    return {
      id: repayment.id,
      loanApplicationId: repayment.loanApplicationId,
      principalAmount: Number(repayment.principalAmount),
      interestAmount: Number(repayment.interestAmount),
      totalAmount: Number(repayment.totalAmount),
      interestRate: Number(repayment.interestRate),
      interestDays: repayment.interestDays,
      dueDate: repayment.dueDate.toISOString(),
      status: repayment.status,
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

    if (data.oldValue !== null) auditData.oldValue = data.oldValue;
    if (data.newValue !== null) auditData.newValue = data.newValue;

    await this.auditLogsService.log(auditData);
  }
}
