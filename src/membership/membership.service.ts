import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RazorpayService } from '../razorpay/razorpay.service';
import { CreateMembershipCouponDto } from './dto/create-membership-coupon.dto';
import { CreateMembershipPlanConfigDto } from './dto/create-membership-plan-config.dto';
import { UpdateMembershipPlanConfigDto } from './dto/update-membership-plan-config.dto';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  containsSearch,
  getOrderBy,
  getPagination,
  hasSearch,
  paginate,
} from '../common/utils/pagination.util';
import { MembershipListQueryDto } from './dto/membership-list-query.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ConfigService } from '@nestjs/config';

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpayService: RazorpayService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ─── Plan config (admin) ─────────────────────────────────────────────────

  async listPlanConfigs() {
    return this.prisma.membershipPlanConfig.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createPlanConfig(dto: CreateMembershipPlanConfigDto) {
    const existing = await this.prisma.membershipPlanConfig.findUnique({
      where: { planKey: dto.planKey },
    });
    if (existing) {
      throw new ConflictException(`A plan with key '${dto.planKey}' already exists`);
    }

    const saProduct = await this.prisma.loanProduct.findFirstOrThrow({
      where: { productType: 'SA' },
    });

    return this.prisma.membershipPlanConfig.create({
      data: {
        productId: saProduct.id,
        planKey: dto.planKey,
        planName: dto.planName,
        amount: dto.amount,
        validityDays: dto.validityDays,
        billingLabel: dto.billingLabel,
        perMonthLabel: dto.perMonthLabel ?? null,
        isPreferred: dto.isPreferred ?? false,
        isActive: true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updatePlanConfig(planKey: string, dto: UpdateMembershipPlanConfigDto) {
    const plan = await this.prisma.membershipPlanConfig.findUnique({
      where: { planKey },
    });
    if (!plan) throw new NotFoundException(`Plan '${planKey}' not found`);

    return this.prisma.membershipPlanConfig.update({
      where: { planKey },
      data: {
        planName: dto.planName ?? plan.planName,
        amount: dto.amount ?? plan.amount,
        validityDays: dto.validityDays ?? plan.validityDays,
        billingLabel: dto.billingLabel ?? plan.billingLabel,
        perMonthLabel:
          dto.perMonthLabel !== undefined ? dto.perMonthLabel : plan.perMonthLabel,
        isPreferred: dto.isPreferred ?? plan.isPreferred,
        sortOrder: dto.sortOrder ?? plan.sortOrder,
      },
    });
  }

  async togglePlanConfig(planKey: string) {
    const plan = await this.prisma.membershipPlanConfig.findUnique({
      where: { planKey },
    });
    if (!plan) throw new NotFoundException(`Plan '${planKey}' not found`);

    return this.prisma.membershipPlanConfig.update({
      where: { planKey },
      data: { isActive: !plan.isActive },
    });
  }

  // ─── Employee: my membership ─────────────────────────────────────────────

  async getMyMembership(userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const [membership, plans] = await Promise.all([
      this.prisma.membership.findUnique({
        where: { employeeId: employee.id },
        include: { paymentOrder: true },
      }),
      this.getActivePlansConfig(),
    ]);

    if (!membership) {
      return {
        active: false,
        planType: null,
        planName: null,
        amountPaid: 0,
        memberSince: null,
        validTill: null,
        daysRemaining: 0,
        plans,
        membership: null,
      };
    }

    const today = new Date();
    const daysRemaining = Math.max(
      0,
      Math.ceil(
        (membership.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );

    return {
      active: membership.status === 'ACTIVE',
      planType: membership.planType,
      planName: membership.planName,
      amountPaid: Number(membership.amountPaid ?? membership.amount),
      memberSince: membership.startDate,
      validTill: membership.endDate,
      daysRemaining,
      plans,
      membership,
    };
  }

  // ─── Payment: Razorpay flow ──────────────────────────────────────────────

  /**
   * Step 1: Initiate payment.
   * Creates a Razorpay order and persists a PaymentOrder record.
   * Returns the order details needed to open the Razorpay checkout modal.
   */
  async initiatePayment(userId: string, dto: InitiatePaymentDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    // Block if already has an active membership
    const existing = await this.prisma.membership.findUnique({
      where: { employeeId: employee.id },
    });
    if (existing?.status === 'ACTIVE' && existing.endDate > new Date()) {
      throw new BadRequestException('You already have an active membership');
    }

    // Validate plan
    const plan = await this.prisma.membershipPlanConfig.findUnique({
      where: { planKey: dto.planKey },
    });
    if (!plan) throw new BadRequestException(`Plan '${dto.planKey}' not found`);
    if (!plan.isActive) throw new BadRequestException(`Plan '${dto.planKey}' is not available`);

    // Coupon handling
    let discountAmountPaise = 0;
    let couponCode: string | null = null;

    if (dto.couponCode?.trim()) {
      const couponResult = await this.validateCoupon(dto.couponCode.trim());
      discountAmountPaise = Math.round(couponResult.discountAmount * 100); // rupees → paise
      couponCode = couponResult.couponCode;
    }

    const planAmountPaise = Math.round(Number(plan.amount) * 100);
    const finalAmountPaise = Math.max(0, planAmountPaise - discountAmountPaise);

    // Check if there's already a non-expired CREATED order for this employee + plan
    // Return it instead of creating a duplicate (handles browser refreshes / double taps)
    const existingOrder = await this.prisma.paymentOrder.findFirst({
      where: {
        employeeId: employee.id,
        purpose: 'MEMBERSHIP',
        planKey: plan.planKey,
        status: 'CREATED',
        expiresAt: { gt: new Date() },
        couponCode: couponCode ?? null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingOrder) {
      return {
        orderId: existingOrder.providerOrderId,
        paymentOrderId: existingOrder.id,
        amount: existingOrder.amount,
        currency: existingOrder.currency,
        keyId: this.razorpayService.getKeyId(),
        planName: plan.planName,
        description: `MobPae ${plan.planName} Membership`,
        employeeName: employee.name,
        employeeEmail: employee.email,
        employeePhone: employee.phone,
      };
    }

    // Create Razorpay order
    const receipt = `mp-mem-${employee.id.slice(-8)}-${Date.now()}`;
    const rzpOrder = await this.razorpayService.createOrder({
      amount: finalAmountPaise,
      currency: 'INR',
      receipt,
      notes: {
        employeeId: employee.id,
        planKey: plan.planKey,
        employeeName: employee.name,
        ...(couponCode ? { couponCode } : {}),
      },
    });

    // Persist PaymentOrder
    const paymentOrder = await this.prisma.paymentOrder.create({
      data: {
        provider: 'RAZORPAY',
        purpose: 'MEMBERSHIP',
        providerOrderId: rzpOrder.id,
        amount: finalAmountPaise,
        currency: 'INR',
        employeeId: employee.id,
        planKey: plan.planKey,
        couponCode,
        discountAmount: discountAmountPaise,
        status: 'CREATED',
        notes: {
          receipt,
          planName: plan.planName,
        },
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    return {
      orderId: rzpOrder.id,
      paymentOrderId: paymentOrder.id,
      amount: finalAmountPaise,
      currency: 'INR',
      keyId: this.razorpayService.getKeyId(),
      planName: plan.planName,
      description: `MobPae ${plan.planName} Membership`,
      employeeName: employee.name,
      employeeEmail: employee.email,
      employeePhone: employee.phone,
    };
  }

  /**
   * Step 2a: Client-side verification (fast path).
   * Called by the app immediately after Razorpay checkout handler fires.
   * Verifies the signature and activates membership instantly.
   * Idempotent: safe to call multiple times for the same payment.
   */
  async verifyPayment(userId: string, dto: VerifyPaymentDto) {
    // 1. Verify HMAC signature
    let signatureValid: boolean;
    try {
      signatureValid = this.razorpayService.verifyPaymentSignature({
        razorpayOrderId: dto.razorpayOrderId,
        razorpayPaymentId: dto.razorpayPaymentId,
        razorpaySignature: dto.razorpaySignature,
      });
    } catch {
      throw new BadRequestException('Signature verification failed');
    }

    if (!signatureValid) {
      throw new BadRequestException('Invalid payment signature');
    }

    // 2. Load the PaymentOrder
    const order = await this.prisma.paymentOrder.findUnique({
      where: { providerOrderId: dto.razorpayOrderId },
      include: { employee: true },
    });
    if (!order) throw new NotFoundException('Payment order not found');
    if (order.purpose !== 'MEMBERSHIP' || !order.planKey) {
      throw new BadRequestException('Payment order is not for membership');
    }

    // Verify the order belongs to this user
    if (order.employee.userId !== userId) {
      throw new BadRequestException('Payment order does not belong to this user');
    }

    // 3. Idempotent: already captured → return existing membership
    if (order.status === 'CAPTURED') {
      const membership = await this.prisma.membership.findUnique({
        where: { paymentOrderId: order.id },
      });
      return {
        success: true,
        alreadyActivated: true,
        membership,
      };
    }

    // 4. Activate membership
    const membership = await this.activateMembershipFromOrder(order, {
      providerPaymentId: dto.razorpayPaymentId,
      providerSignature: dto.razorpaySignature,
      source: 'CLIENT',
    });

    return { success: true, alreadyActivated: false, membership };
  }

  /**
   * Step 2b: Webhook handler (authoritative path).
   * Called by WebhooksController when Razorpay sends payment.captured / order.paid.
   * Idempotent: safe to call multiple times.
   */
  async handleWebhookPayment(params: {
    eventType: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    status: string;
    method?: string;
    rawPayload?: unknown;
  }) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { providerOrderId: params.razorpayOrderId },
      include: { employee: true },
    });

    if (!order) {
      this.logger.warn(
        `Webhook: PaymentOrder not found for Razorpay order ${params.razorpayOrderId}`,
      );
      return;
    }
    if (order.purpose !== 'MEMBERSHIP') return;

    // Idempotent: already captured
    if (order.status === 'CAPTURED') {
      this.logger.debug(
        `Webhook: Order ${order.id} already captured — skipping`,
      );
      return;
    }

    await this.activateMembershipFromOrder(order, {
      providerPaymentId: params.razorpayPaymentId,
      source: 'WEBHOOK',
      method: params.method,
      rawPayload: params.rawPayload,
    });
  }

  /**
   * Webhook handler for payment.failed events.
   * Records the failure event for audit trail. Does NOT cancel the order
   * (the user may retry within the 15-minute window).
   */
  async handleWebhookPaymentFailed(params: {
    razorpayOrderId: string;
    razorpayPaymentId?: string;
    errorCode?: string;
    errorDescription?: string;
    rawPayload?: unknown;
  }) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { providerOrderId: params.razorpayOrderId },
    });

    if (!order) return;
    if (order.purpose !== 'MEMBERSHIP') return;
    if (order.status === 'CAPTURED') return; // Already succeeded, ignore the failed event

    await this.prisma.$transaction([
      this.prisma.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'ATTEMPTED' }, // Attempted but failed; user can retry
      }),
      this.prisma.paymentEvent.create({
        data: {
          orderId: order.id,
          providerPaymentId: params.razorpayPaymentId ?? null,
          eventType: 'payment.failed',
          source: 'WEBHOOK',
          status: 'failed',
          errorCode: params.errorCode ?? null,
          errorDescription: params.errorDescription ?? null,
          rawPayload: params.rawPayload as any ?? undefined,
        },
      }),
    ]);
  }

  // ─── Admin: approve / reject (manual override) ───────────────────────────

  /**
   * Admin can manually activate a membership (override for edge cases).
   * Also handles auto-advancing salary requests that were AWAITING_MEMBERSHIP_PAYMENT.
   */
  async approve(membershipId: string, adminUserId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) throw new NotFoundException('Membership not found');
    if (membership.status === 'ACTIVE')
      throw new BadRequestException('Membership already active');

    const plan = await this.getPlanOrDefault(membership.planType);
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.validityDays);

    const updatedMembership = await this.prisma.$transaction(async (tx) => {
      return tx.membership.update({
        where: { id: membershipId },
        data: {
          status: 'ACTIVE',
          startDate,
          endDate,
          verifiedAt: new Date(),
          verifiedBy: adminUserId,
          remarks: null,
        },
        include: { employee: true },
      });
    });

    // Notifications + email
    if (updatedMembership.employee?.userId) {
      await this.notificationsService
        .createSystemNotification(
          updatedMembership.employee.userId,
          'Membership Approved',
          `Your MobPae ${plan.planName} membership is now active.`,
        )
        .catch((err) => console.error('Membership approved notification error', err));
    }

    try {
      await this.emailService.sendMembershipApprovedEmail({
        to: updatedMembership.employee.email,
        employeeName: updatedMembership.employee.name,
        plan: updatedMembership.planName,
        startDate,
        endDate,
      });
    } catch (err) {
      console.error('Failed to send membership approved email', err);
    }

    // Auto-advance any AWAITING_MEMBERSHIP_PAYMENT salary requests
    await this.advancePendingLoanRequests(
      membership.employeeId,
      updatedMembership.employee,
      adminUserId,
    );

    return updatedMembership;
  }

  async reject(membershipId: string, remarks: string, actorUserId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: { employee: true },
    });

    if (!membership) throw new NotFoundException('Membership not found');

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { status: 'CANCELLED', remarks },
    });

    await this.auditLogsService.log({
      userId: actorUserId,
      action: 'MEMBERSHIP_CANCELLED',
      entityType: 'MEMBERSHIP',
      entityId: membershipId,
      oldValue: { status: membership.status, remarks: membership.remarks },
      newValue: { status: updated.status, remarks: updated.remarks },
    });

    if (membership.employee?.userId) {
      await this.notificationsService
        .createSystemNotification(
          membership.employee.userId,
          'Membership Cancelled',
          remarks || 'Your membership has been cancelled.',
        )
        .catch((err) => console.error('Membership cancelled notification error', err));
    }

    try {
      await this.emailService.sendMembershipRejectedEmail({
        to: membership.employee.email,
        employeeName: membership.employee.name,
        remarks,
      });
    } catch (err) {
      console.error('Failed to send membership cancelled email', err);
    }

    return updated;
  }

  // ─── Internal: fast-activate (used by loan-applications flow) ───────────

  /**
   * Directly activates a membership for an employee (e.g. admin action or test).
   * Uses the plan already stored on the membership record, defaulting to MONTHLY.
   */
  async activate(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const existingMembership = await this.prisma.membership.findUnique({
      where: { employeeId },
    });
    if (existingMembership?.status === 'ACTIVE') {
      throw new BadRequestException('Membership already active');
    }

    const planKey = existingMembership?.planType ?? 'MONTHLY';
    const plan = await this.getPlanOrDefault(planKey);

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.validityDays);

    return this.prisma.membership.upsert({
      where: { employeeId },
      update: {
        planType: plan.planKey,
        planName: plan.planName,
        amount: plan.amount,
        startDate,
        endDate,
        status: 'ACTIVE',
      },
      create: {
        employeeId,
        planKey: plan.planKey,
        planType: plan.planKey,
        planName: plan.planName,
        amount: plan.amount,
        startDate,
        endDate,
        status: 'ACTIVE',
      },
    });
  }

  async isActive(employeeId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { employeeId },
    });

    if (!membership) return false;

    if (membership.status === 'ACTIVE' && membership.endDate < new Date()) {
      await this.prisma.membership.update({
        where: { id: membership.id },
        data: { status: 'EXPIRED' },
      });
      return false;
    }

    return membership.status === 'ACTIVE' && membership.endDate > new Date();
  }

  // ─── Coupon management ───────────────────────────────────────────────────

  async createCoupon(dto: CreateMembershipCouponDto) {
    return this.prisma.membershipCoupon.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        discountAmount: dto.discountAmount,
        validTill: dto.validTill,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAllCoupons() {
    return this.prisma.membershipCoupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  /**
   * Validate a coupon — returns the flat discount amount.
   * The client applies this to whichever plan the user selected.
   */
  async validateCoupon(couponCode: string) {
    const coupon = await this.prisma.membershipCoupon.findUnique({
      where: { code: couponCode.trim().toUpperCase() },
    });

    if (!coupon) throw new BadRequestException('Invalid coupon code');
    if (!coupon.isActive) throw new BadRequestException('Coupon is inactive');
    if (coupon.validTill && coupon.validTill < new Date())
      throw new BadRequestException('Coupon expired');
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit)
      throw new BadRequestException('Coupon usage limit reached');

    return {
      valid: true,
      couponCode: coupon.code,
      discountAmount: Number(coupon.discountAmount),
    };
  }

  // ─── Admin list / detail ─────────────────────────────────────────────────

  async findOne(id: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { id },
      include: { employee: true, paymentOrder: { include: { events: true } } },
    });
    if (!membership) throw new NotFoundException('Membership not found');
    return membership;
  }

  async findAll(query: MembershipListQueryDto = {}) {
    const { page, limit, skip, take } = getPagination(query);
    const where: any = {
      status: query.status,
      ...(hasSearch(query)
        ? {
            OR: [
              { planName: containsSearch(query) },
              { couponCode: containsSearch(query) },
              { employee: { name: containsSearch(query) } },
              { employee: { email: containsSearch(query) } },
              {
                employee: {
                  employer: { companyName: containsSearch(query) },
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.membership.findMany({
        where,
        include: {
          employee: { include: { employer: true } },
          paymentOrder: true,
        },
        orderBy: getOrderBy(
          query,
          ['planName', 'amount', 'startDate', 'endDate', 'status', 'createdAt'],
          'createdAt',
        ),
        skip,
        take,
      }),
      this.prisma.membership.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findPending(query: MembershipListQueryDto = {}) {
    return this.findAll({ ...query, status: 'PENDING' });
  }

  // ─── Summaries ───────────────────────────────────────────────────────────

  async getSummary() {
    const memberships = await this.prisma.membership.findMany();
    const active = memberships.filter((m) => m.status === 'ACTIVE').length;
    const pending = memberships.filter((m) => m.status === 'PENDING').length;
    const rejected = memberships.filter((m) => m.status === 'REJECTED').length;
    const expired = memberships.filter(
      (m) => m.status === 'ACTIVE' && m.endDate < new Date(),
    ).length;
    const membershipRevenue = memberships.reduce(
      (sum, m) => sum + Number(m.amountPaid ?? m.amount),
      0,
    );
    return { totalMembers: memberships.length, active, pending, rejected, expired, membershipRevenue };
  }

  async getEmployerSummary() {
    const memberships = await this.prisma.membership.findMany({
      include: { employee: { include: { employer: true } } },
    });

    const employerMap = new Map<string, any>();

    for (const membership of memberships) {
      const employer = membership.employee?.employer;
      if (!employer) continue;

      if (!employerMap.has(employer.id)) {
        employerMap.set(employer.id, {
          employerId: employer.id,
          companyName: employer.companyName,
          totalMembers: 0,
          activeMembers: 0,
          membershipRevenue: 0,
        });
      }

      const summary = employerMap.get(employer.id);
      summary.totalMembers++;
      if (membership.status === 'ACTIVE') summary.activeMembers++;
      summary.membershipRevenue += Number(membership.amountPaid ?? membership.amount);
    }

    return Array.from(employerMap.values()).sort(
      (a, b) => b.membershipRevenue - a.membershipRevenue,
    );
  }

  async getRevenueSummary() {
    const memberships = await this.prisma.membership.findMany();
    const repayments = await this.prisma.repayment.findMany();

    const membershipRevenue = memberships.reduce(
      (sum, m) => sum + Number(m.amountPaid ?? m.amount),
      0,
    );
    const interestRevenue = repayments.reduce(
      (sum, r) => sum + Number(r.interestAmount),
      0,
    );

    return {
      membershipRevenue,
      interestRevenue,
      totalRevenue: membershipRevenue + interestRevenue,
    };
  }

  // ─── Config (served to the employee app) ────────────────────────────────

  async getConfig() {
    const [plans, benefitsSetting] = await Promise.all([
      this.getActivePlansConfig(),
      this.prisma.setting.findUnique({
        where: { key: 'MEMBERSHIP_BENEFITS' },
      }),
    ]);

    const membershipBenefits = benefitsSetting?.value
      ? (JSON.parse(benefitsSetting.value) as string[])
      : [
          'Advances up to 50% of salary, instantly',
          'Zero processing fees on every advance',
          'Auto-recovery on payday — no EMIs',
          'Priority chat support',
        ];

    return {
      plans,
      membershipBenefits,
      payment: {
        provider: 'razorpay',
        keyId: this.razorpayService.getKeyId(),
      },
    };
  }

  // ─── Plan config management ──────────────────────────────────────────────

  // (Already defined above — listPlanConfigs, createPlanConfig, updatePlanConfig, togglePlanConfig)

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Core membership activation logic.
   * Used by both verifyPayment (client path) and handleWebhookPayment (webhook path).
   * Runs inside a transaction: updates PaymentOrder status, creates PaymentEvent,
   * upserts Membership, increments coupon usage, sends notifications.
   */
  private async activateMembershipFromOrder(
    order: {
      id: string;
      employeeId: string;
      planKey: string | null;
      amount: number;
      couponCode: string | null;
      discountAmount: number;
      employee: { userId: string | null; name: string; email: string; phone: string };
    },
    event: {
      providerPaymentId?: string;
      providerSignature?: string;
      source: string;
      method?: string;
      rawPayload?: unknown;
    },
  ) {
    if (!order.planKey) {
      throw new BadRequestException('Membership payment order missing plan');
    }

    const plan = await this.getPlanOrDefault(order.planKey);
    const now = new Date();
    const endDate = new Date(now.getTime() + plan.validityDays * 24 * 60 * 60 * 1000);
    const amountPaid = order.amount / 100; // paise → rupees

    const membership = await this.prisma.$transaction(async (tx) => {
      // 1. Update PaymentOrder status
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'CAPTURED' },
      });

      // 2. Record PaymentEvent
      await tx.paymentEvent.create({
        data: {
          orderId: order.id,
          providerPaymentId: event.providerPaymentId ?? null,
          providerSignature: event.providerSignature ?? null,
          eventType: 'payment.captured',
          source: event.source,
          status: 'captured',
          method: event.method ?? null,
          rawPayload: event.rawPayload as any ?? undefined,
          capturedAt: now,
        },
      });

      // 3. Upsert Membership (handles re-subscriptions)
      const mem = await tx.membership.upsert({
        where: { employeeId: order.employeeId },
        create: {
          employeeId: order.employeeId,
          planKey: plan.planKey,
          planType: plan.planKey,
          planName: plan.planName,
          amount: plan.amount,
          amountPaid,
          startDate: now,
          endDate,
          status: 'ACTIVE',
          paymentOrderId: order.id,
          couponCode: order.couponCode,
          discountAmount: order.discountAmount > 0 ? order.discountAmount / 100 : null,
        },
        update: {
          planKey: plan.planKey,
          planType: plan.planKey,
          planName: plan.planName,
          amount: plan.amount,
          amountPaid,
          startDate: now,
          endDate,
          status: 'ACTIVE',
          paymentOrderId: order.id,
          couponCode: order.couponCode,
          discountAmount: order.discountAmount > 0 ? order.discountAmount / 100 : null,
          verifiedBy: null,
          verifiedAt: null,
          remarks: null,
        },
      });

      // 4. Increment coupon usage
      if (order.couponCode) {
        await tx.membershipCoupon
          .update({
            where: { code: order.couponCode },
            data: { usedCount: { increment: 1 } },
          })
          .catch((err) =>
            this.logger.warn(`Failed to increment coupon usage for ${order.couponCode}: ${err}`),
          );
      }

      return mem;
    });

    // 5. Post-transaction: notifications, email, salary request advancement
    await Promise.allSettled([
      order.employee.userId
        ? this.notificationsService.createSystemNotification(
            order.employee.userId,
            'Membership Activated!',
            `Your MobPae ${plan.planName} membership is now active. Enjoy advances up to 50% of your salary.`,
          )
        : Promise.resolve(),

      this.emailService
        .sendMembershipApprovedEmail({
          to: order.employee.email,
          employeeName: order.employee.name,
          plan: plan.planName,
          startDate: now,
          endDate,
        })
        .catch((err) => this.logger.warn(`Membership email failed: ${err}`)),

      this.advancePendingLoanRequests(
        order.employeeId,
        { userId: order.employee.userId } as any,
        'SYSTEM',
      ),
    ]);

    return membership;
  }

  /**
   * Auto-advances any salary requests that were waiting for membership payment.
   * Called after membership activation.
   */
  private async advancePendingLoanRequests(
    employeeId: string,
    employee: { userId: string | null },
    actorId: string,
  ) {
    const waitingRequests = await this.prisma.loanApplication.findMany({
      where: {
        employeeId,
        status: 'AWAITING_MEMBERSHIP_PAYMENT',
      },
    });

    if (waitingRequests.length === 0) return;

    await this.prisma.loanApplication.updateMany({
      where: {
        employeeId,
        status: 'AWAITING_MEMBERSHIP_PAYMENT',
      },
      data: { status: 'READY_FOR_DISBURSAL' },
    });

    await this.prisma.loanApplicationHistory.createMany({
      data: waitingRequests.map((req) => ({
        loanApplicationId: req.id,
        previousStatus: req.status,
        newStatus: 'READY_FOR_DISBURSAL',
        changedBy: actorId,
        actorRole: 'SYSTEM',
        remarks: 'Membership payment confirmed; request ready for disbursal',
      })),
    });

    if (employee.userId) {
      await this.notificationsService
        .createSystemNotification(
          employee.userId,
          'Advance Request Ready',
          'Your salary advance request is now ready for disbursal.',
        )
        .catch(() => null);
    }

    // Notify admins
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });

    await Promise.allSettled(
      admins.map((admin) =>
        this.notificationsService.createSystemNotification(
          admin.id,
          'Salary Request Ready for Disbursal',
          `An employee's membership has been activated. Their salary advance request is now ready for disbursal.`,
        ),
      ),
    );
  }

  /**
   * Returns all active plans sorted by sortOrder ascending.
   * Shapes the data to match the frontend contract.
   */
  private async getActivePlansConfig() {
    const plans = await this.prisma.membershipPlanConfig.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return plans.map((p) => ({
      planType: p.planKey,
      planName: p.planName,
      amount: Number(p.amount),
      validityDays: p.validityDays,
      billingLabel: p.billingLabel,
      perMonthLabel: p.perMonthLabel ?? null,
      preferred: p.isPreferred,
      savingsVsMonthly: this.calcSavingsVsMonthly(plans, p),
      savingsPercent: this.calcSavingsPercent(plans, p),
    }));
  }

  /**
   * Calculates how much you save vs. buying the Monthly plan repeatedly.
   * Returns null for the Monthly plan itself or if no monthly plan exists.
   */
  private calcSavingsVsMonthly(
    allPlans: { planKey: string; amount: any; validityDays: number }[],
    plan: { planKey: string; amount: any; validityDays: number },
  ): number | null {
    const monthly = allPlans.find((p) => p.planKey === 'MONTHLY');
    if (!monthly || plan.planKey === 'MONTHLY') return null;

    const monthlyAmount = Number(monthly.amount);
    const monthsEquivalent = Math.round(plan.validityDays / 30);
    const savings = monthlyAmount * monthsEquivalent - Number(plan.amount);
    return savings > 0 ? savings : null;
  }

  private calcSavingsPercent(
    allPlans: { planKey: string; amount: any; validityDays: number }[],
    plan: { planKey: string; amount: any; validityDays: number },
  ): number | null {
    const monthly = allPlans.find((p) => p.planKey === 'MONTHLY');
    if (!monthly || plan.planKey === 'MONTHLY') return null;

    const monthlyAmount = Number(monthly.amount);
    const monthsEquivalent = Math.round(plan.validityDays / 30);
    const fullPrice = monthlyAmount * monthsEquivalent;
    if (fullPrice === 0) return null;

    const percent = Math.round(((fullPrice - Number(plan.amount)) / fullPrice) * 100);
    return percent > 0 ? percent : null;
  }

  /**
   * Fetches a plan by key. Falls back to MONTHLY if the key is no longer active.
   */
  private async getPlanOrDefault(planKey: string) {
    const plan = await this.prisma.membershipPlanConfig.findUnique({
      where: { planKey },
    });
    if (plan) return plan;

    const fallback = await this.prisma.membershipPlanConfig.findUnique({
      where: { planKey: 'MONTHLY' },
    });
    if (fallback) return fallback;

    throw new NotFoundException(
      `Plan '${planKey}' not found and no fallback MONTHLY plan exists`,
    );
  }
}
