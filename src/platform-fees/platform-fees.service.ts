import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  LoanApplication,
  LoanApplicationFee,
  LoanApplicationFeeStatus,
  LoanApplicationFeeType,
  LoanApplicationStatus,
  PaymentOrderPurpose,
  PaymentOrderStatus,
  Prisma,
  Role,
} from '@prisma/client';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { getOrderBy, getPagination, paginate } from '../common/utils/pagination.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RazorpayService } from '../razorpay/razorpay.service';
import { PlatformFeeListQueryDto } from './dto/platform-fee-list-query.dto';
import { VerifyPlatformFeePaymentDto } from './dto/verify-platform-fee-payment.dto';
import { WaivePlatformFeeDto } from './dto/waive-platform-fee.dto';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PlatformFeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
    private readonly notifications: NotificationsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async getConfig() {
    const config = await this.getActivePlatformFeeConfig();
    return {
      amount: config.amount,
      amountPaise: this.toPaise(config.amount),
      currency: config.currency,
      keyId: this.razorpay.getKeyId(),
      label: 'Platform fee',
      description:
        'Pay this one-time platform fee after employer approval to move your advance to MobPae review.',
    };
  }

  async ensureFeeForApplication(
    client: PrismaClientLike,
    loanApplication: Pick<
      LoanApplication,
      'id' | 'employeeId' | 'employerId' | 'status'
    >,
  ) {
    const feeType = LoanApplicationFeeType.PLATFORM_FEE;
    const existing = await client.loanApplicationFee.findUnique({
      where: {
        loanApplicationId_feeType: {
          loanApplicationId: loanApplication.id,
          feeType,
        },
      },
    });

    if (existing) {
      return existing;
    }

    const config = await this.getActivePlatformFeeConfig(client);

    return client.loanApplicationFee.create({
      data: {
        loanApplicationId: loanApplication.id,
        employeeId: loanApplication.employeeId,
        employerId: loanApplication.employerId,
        feeType,
        amount: config.amount,
        currency: config.currency,
        status: LoanApplicationFeeStatus.PENDING_PAYMENT,
      },
    });
  }

  async isFeeCleared(loanApplicationId: string) {
    const fee = await this.prisma.loanApplicationFee.findUnique({
      where: {
        loanApplicationId_feeType: {
          loanApplicationId,
          feeType: LoanApplicationFeeType.PLATFORM_FEE,
        },
      },
      select: {
        status: true,
      },
    });

    return (
      fee?.status === LoanApplicationFeeStatus.PAID ||
      fee?.status === LoanApplicationFeeStatus.WAIVED
    );
  }

  async initiatePayment(userId: string, loanApplicationId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId },
      include: {
        user: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not found');
    }

    const application = await this.prisma.loanApplication.findUnique({
      where: { id: loanApplicationId },
      include: {
        platformFee: {
          include: {
            paymentOrders: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Salary advance request not found');
    }

    if (application.employeeId !== employee.id) {
      throw new ForbiddenException('You can only pay for your own request');
    }

    if (
      application.status !== LoanApplicationStatus.AWAITING_PLATFORM_FEE_PAYMENT
    ) {
      throw new BadRequestException(
        'Platform fee is available only after employer approval',
      );
    }

    const fee =
      application.platformFee ??
      (await this.ensureFeeForApplication(this.prisma, application));

    if (
      fee.status === LoanApplicationFeeStatus.PAID ||
      fee.status === LoanApplicationFeeStatus.WAIVED
    ) {
      return {
        alreadyPaid: true,
        fee: this.formatFee(fee),
        requestStatus: application.status,
      };
    }

    const reusableOrder = await this.prisma.paymentOrder.findFirst({
      where: {
        loanApplicationFeeId: fee.id,
        purpose: PaymentOrderPurpose.PLATFORM_FEE,
        status: PaymentOrderStatus.CREATED,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (reusableOrder) {
      return this.formatOrderResponse(reusableOrder, fee, employee);
    }

    const amountPaise = this.toPaise(Number(fee.amount));
    const razorpayOrder = await this.razorpay.createOrder({
      amount: amountPaise,
      currency: fee.currency,
      receipt: `pf_${fee.id.slice(0, 24)}`,
      notes: {
        purpose: PaymentOrderPurpose.PLATFORM_FEE,
        platformFeeId: fee.id,
        loanApplicationId: application.id,
        employeeId: employee.id,
      },
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const paymentOrder = await this.prisma.paymentOrder.create({
      data: {
        providerOrderId: razorpayOrder.id,
        purpose: PaymentOrderPurpose.PLATFORM_FEE,
        amount: amountPaise,
        currency: fee.currency,
        employeeId: employee.id,
        loanApplicationFeeId: fee.id,
        status: PaymentOrderStatus.CREATED,
        notes: {
          loanApplicationId: application.id,
          platformFeeId: fee.id,
        },
        expiresAt,
      },
    });

    await this.prisma.loanApplicationFee.update({
      where: { id: fee.id },
      data: { providerOrderId: razorpayOrder.id },
    });

    return this.formatOrderResponse(paymentOrder, fee, employee);
  }

  async verifyPayment(userId: string, dto: VerifyPlatformFeePaymentDto) {
    const isValid = this.razorpay.verifyPaymentSignature(dto);
    if (!isValid) {
      throw new BadRequestException('Invalid payment signature');
    }

    const order = await this.prisma.paymentOrder.findUnique({
      where: { providerOrderId: dto.razorpayOrderId },
      include: {
        platformFee: {
          include: {
            loanApplication: true,
            employee: true,
          },
        },
      },
    });

    if (!order || order.purpose !== PaymentOrderPurpose.PLATFORM_FEE) {
      throw new NotFoundException('Platform fee payment order not found');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { userId },
      select: { id: true },
    });

    if (!employee || employee.id !== order.employeeId) {
      throw new ForbiddenException('You can only verify your own payment');
    }

    return this.markFeePaidFromOrder({
      providerOrderId: dto.razorpayOrderId,
      providerPaymentId: dto.razorpayPaymentId,
      providerSignature: dto.razorpaySignature,
      source: 'CHECKOUT',
      rawPayload: dto,
    });
  }

  async handleWebhookPayment(params: {
    eventType: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    status: string;
    method?: string;
    rawPayload?: unknown;
  }) {
    if (!params.razorpayOrderId) return null;

    return this.markFeePaidFromOrder({
      providerOrderId: params.razorpayOrderId,
      providerPaymentId: params.razorpayPaymentId,
      providerSignature: undefined,
      source: 'WEBHOOK',
      rawPayload: params.rawPayload,
      method: params.method,
      capturedAt: new Date(),
    });
  }

  async handleWebhookPaymentFailed(params: {
    razorpayOrderId: string;
    razorpayPaymentId?: string;
    errorCode?: string;
    errorDescription?: string;
    rawPayload?: unknown;
  }) {
    if (!params.razorpayOrderId) return null;

    const order = await this.prisma.paymentOrder.findUnique({
      where: { providerOrderId: params.razorpayOrderId },
      include: { platformFee: true },
    });

    if (!order || order.purpose !== PaymentOrderPurpose.PLATFORM_FEE) {
      return null;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: { status: PaymentOrderStatus.ATTEMPTED },
      });

      await tx.paymentEvent.create({
        data: {
          orderId: order.id,
          providerPaymentId: params.razorpayPaymentId,
          eventType: 'payment.failed',
          source: 'WEBHOOK',
          status: 'FAILED',
          errorCode: params.errorCode,
          errorDescription: params.errorDescription,
          rawPayload: (params.rawPayload as Prisma.InputJsonValue) ?? undefined,
        },
      });
    });

    return { success: true };
  }

  async findMine(userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not found');
    }

    const fees = await this.prisma.loanApplicationFee.findMany({
      where: { employeeId: employee.id },
      include: this.feeInclude(),
      orderBy: { createdAt: 'desc' },
    });

    return fees.map((fee) => this.formatFee(fee));
  }

  async findAll(query: PlatformFeeListQueryDto) {
    const { page, limit, skip, take } = getPagination(query);
    const where: Prisma.LoanApplicationFeeWhereInput = {
      status: query.status,
      employerId: query.employerId,
      employeeId: query.employeeId,
      loanApplicationId: query.loanApplicationId,
      ...(query.search
        ? {
            OR: [
              { employee: { name: { contains: query.search, mode: 'insensitive' } } },
              { employee: { email: { contains: query.search, mode: 'insensitive' } } },
              {
                employer: {
                  companyName: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                loanApplication: {
                  applicationNumber: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.loanApplicationFee.findMany({
        where,
        include: this.feeInclude(),
        orderBy: getOrderBy(query, ['amount', 'status', 'paidAt', 'createdAt']),
        skip,
        take,
      }),
      this.prisma.loanApplicationFee.count({ where }),
    ]);

    return paginate(
      data.map((fee) => this.formatFee(fee)),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string) {
    const fee = await this.prisma.loanApplicationFee.findUnique({
      where: { id },
      include: this.feeInclude(),
    });

    if (!fee) {
      throw new NotFoundException('Platform fee not found');
    }

    return this.formatFee(fee);
  }

  async waive(id: string, adminUserId: string, dto: WaivePlatformFeeDto) {
    const fee = await this.prisma.loanApplicationFee.findUnique({
      where: { id },
      include: {
        loanApplication: true,
        employee: { include: { user: true } },
      },
    });

    if (!fee) {
      throw new NotFoundException('Platform fee not found');
    }

    if (
      fee.status === LoanApplicationFeeStatus.PAID ||
      fee.status === LoanApplicationFeeStatus.WAIVED
    ) {
      return this.findOne(id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.loanApplicationFee.update({
        where: { id },
        data: {
          status: LoanApplicationFeeStatus.WAIVED,
          waivedAt: new Date(),
          waivedBy: adminUserId,
          remarks: dto.remarks,
        },
      });

      if (
        fee.loanApplication.status ===
        LoanApplicationStatus.AWAITING_PLATFORM_FEE_PAYMENT
      ) {
        await tx.loanApplication.update({
          where: { id: fee.loanApplicationId },
          data: { status: LoanApplicationStatus.EMPLOYER_APPROVED },
        });

        await tx.loanApplicationHistory.create({
          data: {
            loanApplicationId: fee.loanApplicationId,
            previousStatus: fee.loanApplication.status,
            newStatus: LoanApplicationStatus.EMPLOYER_APPROVED,
            changedBy: adminUserId,
            actorRole: Role.ADMIN,
            remarks: 'Platform fee waived; moved to admin review.',
          },
        });
      }
    });

    await this.auditLogs.log({
      userId: adminUserId,
      action: 'PLATFORM_FEE_WAIVED',
      entityType: 'PLATFORM_FEE',
      entityId: id,
      oldValue: { status: fee.status },
      newValue: { status: LoanApplicationFeeStatus.WAIVED, remarks: dto.remarks },
    });

    await this.safeNotify(
      fee.employee.userId,
      'Platform fee waived',
      'Your salary advance has moved to MobPae review.',
    );

    return this.findOne(id);
  }

  private async markFeePaidFromOrder(args: {
    providerOrderId: string;
    providerPaymentId?: string;
    providerSignature?: string;
    source: string;
    rawPayload?: unknown;
    method?: string;
    capturedAt?: Date;
  }) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { providerOrderId: args.providerOrderId },
      include: {
        platformFee: {
          include: {
            loanApplication: true,
            employee: { include: { user: true } },
          },
        },
      },
    });

    if (!order || order.purpose !== PaymentOrderPurpose.PLATFORM_FEE) {
      throw new NotFoundException('Platform fee payment order not found');
    }

    if (!order.platformFee) {
      throw new BadRequestException('Payment order is not linked to a platform fee');
    }

    const fee = order.platformFee;
    const alreadyPaid =
      order.status === PaymentOrderStatus.CAPTURED &&
      fee.status === LoanApplicationFeeStatus.PAID;

    if (!alreadyPaid) {
      await this.prisma.$transaction(async (tx) => {
        await tx.paymentOrder.update({
          where: { id: order.id },
          data: { status: PaymentOrderStatus.CAPTURED },
        });

        await tx.paymentEvent.create({
          data: {
            orderId: order.id,
            providerPaymentId: args.providerPaymentId,
            providerSignature: args.providerSignature,
            eventType: 'payment.captured',
            source: args.source,
            status: 'CAPTURED',
            method: args.method,
            rawPayload: (args.rawPayload as Prisma.InputJsonValue) ?? undefined,
            capturedAt: args.capturedAt ?? new Date(),
          },
        });

        await tx.loanApplicationFee.update({
          where: { id: fee.id },
          data: {
            status: LoanApplicationFeeStatus.PAID,
            providerOrderId: order.providerOrderId,
            providerPaymentId: args.providerPaymentId,
            providerSignature: args.providerSignature,
            paidAt: new Date(),
          },
        });

        if (
          fee.loanApplication.status ===
          LoanApplicationStatus.AWAITING_PLATFORM_FEE_PAYMENT
        ) {
          await tx.loanApplication.update({
            where: { id: fee.loanApplicationId },
            data: { status: LoanApplicationStatus.EMPLOYER_APPROVED },
          });

          await tx.loanApplicationHistory.create({
            data: {
              loanApplicationId: fee.loanApplicationId,
              previousStatus: fee.loanApplication.status,
              newStatus: LoanApplicationStatus.EMPLOYER_APPROVED,
              changedBy: fee.employee.userId,
              actorRole: Role.EMPLOYEE,
              remarks: 'Platform fee paid; ready for MobPae admin review.',
            },
          });
        }
      });

      await this.auditLogs.log({
        userId: fee.employee.userId,
        action: 'PLATFORM_FEE_PAID',
        entityType: 'PLATFORM_FEE',
        entityId: fee.id,
        oldValue: { status: fee.status },
        newValue: {
          status: LoanApplicationFeeStatus.PAID,
          providerOrderId: order.providerOrderId,
          providerPaymentId: args.providerPaymentId,
        },
      });

      await this.safeNotify(
        fee.employee.userId,
        'Platform fee received',
        'Your salary advance has moved to MobPae review.',
      );

      await this.notifyAdmins(
        'Salary advance ready for review',
        `${fee.employee.name}'s employer-approved advance is ready for admin review.`,
      );
    }

    return {
      success: true,
      fee: await this.findOne(fee.id),
      requestStatus: LoanApplicationStatus.EMPLOYER_APPROVED,
    };
  }

  private async getActivePlatformFeeConfig(client: PrismaClientLike = this.prisma) {
    const config = await client.loanProductConfig.findFirst({
      where: {
        isActive: true,
        product: {
          productType: 'SA',
        },
      },
      orderBy: { versionNumber: 'desc' },
    });

    const pricingRules = config?.pricingRules as
      | Record<string, unknown>
      | undefined;
    const rawAmount = pricingRules?.platformFeeAmount;
    const amount =
      typeof rawAmount === 'string' || typeof rawAmount === 'number'
        ? Number(rawAmount)
        : Number.NaN;

    if (!Number.isFinite(amount) || amount < 0) {
      throw new ServiceUnavailableException(
        'Platform fee is not configured for salary advances',
      );
    }

    return {
      amount,
      currency:
        typeof pricingRules?.platformFeeCurrency === 'string'
          ? pricingRules.platformFeeCurrency.toUpperCase()
          : 'INR',
    };
  }

  private feeInclude() {
    return {
      employee: {
        select: {
          id: true,
          name: true,
          email: true,
          employeeCode: true,
        },
      },
      employer: {
        select: {
          id: true,
          companyName: true,
        },
      },
      loanApplication: {
        select: {
          id: true,
          applicationNumber: true,
          status: true,
          requestedAmount: true,
          employerApprovedAmount: true,
          adminApprovedAmount: true,
        },
      },
      paymentOrders: {
        orderBy: { createdAt: 'desc' as const },
        take: 3,
        select: {
          id: true,
          providerOrderId: true,
          status: true,
          amount: true,
          currency: true,
          createdAt: true,
          expiresAt: true,
        },
      },
    };
  }

  private formatOrderResponse(
    order: { id: string; providerOrderId: string; amount: number; currency: string },
    fee: LoanApplicationFee,
    employee: {
      id: string;
      name: string;
      email: string;
      phone: string;
    },
  ) {
    return {
      paymentOrderId: order.id,
      orderId: order.providerOrderId,
      amount: order.amount,
      amountRupees: Number(fee.amount),
      currency: order.currency,
      keyId: this.razorpay.getKeyId(),
      fee: this.formatFee(fee),
      customer: {
        name: employee.name,
        email: employee.email,
        contact: employee.phone,
      },
      description: 'MobPae platform fee',
    };
  }

  private formatFee(fee: any) {
    return {
      id: fee.id,
      loanApplicationId: fee.loanApplicationId,
      employeeId: fee.employeeId,
      employerId: fee.employerId,
      feeType: fee.feeType,
      amount: Number(fee.amount),
      currency: fee.currency,
      status: fee.status,
      provider: fee.provider,
      providerOrderId: fee.providerOrderId,
      providerPaymentId: fee.providerPaymentId,
      paidAt: fee.paidAt,
      waivedAt: fee.waivedAt,
      waivedBy: fee.waivedBy,
      remarks: fee.remarks,
      createdAt: fee.createdAt,
      updatedAt: fee.updatedAt,
      employee: fee.employee,
      employer: fee.employer,
      loanApplication: fee.loanApplication,
      paymentOrders: fee.paymentOrders,
    };
  }

  private toPaise(amount: number) {
    return Math.round(amount * 100);
  }

  private async safeNotify(
    userId: string | null | undefined,
    title: string,
    message: string,
  ) {
    if (!userId) return;
    try {
      await this.notifications.createSystemNotification(userId, title, message);
    } catch (error) {
      console.error('Failed to create platform fee notification', error);
    }
  }

  private async notifyAdmins(title: string, message: string) {
    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, isActive: true },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin) => this.safeNotify(admin.id, title, message)),
    );
  }
}
