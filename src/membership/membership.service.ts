import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RequestMembershipDto } from './dto/request-membership.dto';
import { CreateMembershipCouponDto } from './dto/create-membership-coupon.dto';
import { CreateMembershipPlanConfigDto } from './dto/create-membership-plan-config.dto';
import { UpdateMembershipPlanConfigDto } from './dto/update-membership-plan-config.dto';
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

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
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

    return this.prisma.membershipPlanConfig.create({
      data: {
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
        ...(dto.planName !== undefined && { planName: dto.planName }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.validityDays !== undefined && { validityDays: dto.validityDays }),
        ...(dto.billingLabel !== undefined && { billingLabel: dto.billingLabel }),
        ...(dto.perMonthLabel !== undefined && { perMonthLabel: dto.perMonthLabel }),
        ...(dto.isPreferred !== undefined && { isPreferred: dto.isPreferred }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
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

  // ─── Employee: membership ─────────────────────────────────────────────────

  async getMyMembership(userId: string) {
    const employee = await this.prisma.employee.findFirst({ where: { userId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const [membership, plans] = await Promise.all([
      this.prisma.membership.findUnique({ where: { employeeId: employee.id } }),
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
      amountPaid: Number(membership.amount),
      memberSince: membership.startDate,
      validTill: membership.endDate,
      daysRemaining,
      plans,
      membership,
    };
  }

  /**
   * Internal: fast-activate a membership (e.g. from AWAITING_MEMBERSHIP_PAYMENT flow).
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

  async requestMembership(userId: string, dto: RequestMembershipDto) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const existingMembership = await this.prisma.membership.findUnique({
      where: { employeeId: employee.id },
    });
    if (existingMembership?.status === 'ACTIVE') {
      throw new BadRequestException('Membership already active');
    }

    // Validate plan exists and is currently active
    const plan = await this.prisma.membershipPlanConfig.findUnique({
      where: { planKey: dto.planType },
    });
    if (!plan) throw new BadRequestException(`Plan '${dto.planType}' does not exist`);
    if (!plan.isActive) throw new BadRequestException(`Plan '${dto.planType}' is not available`);

    // Coupon handling — discount is applied flat to the selected plan amount
    let discountAmount = 0;
    let couponCode: string | null = null;

    if (dto.couponCode?.trim()) {
      const coupon = await this.prisma.membershipCoupon.findUnique({
        where: { code: dto.couponCode.trim().toUpperCase() },
      });

      if (!coupon) throw new BadRequestException('Invalid coupon code');
      if (!coupon.isActive) throw new BadRequestException('Coupon is inactive');
      if (coupon.validTill && coupon.validTill < new Date())
        throw new BadRequestException('Coupon expired');
      if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit)
        throw new BadRequestException('Coupon usage limit reached');

      discountAmount = Number(coupon.discountAmount);
      couponCode = coupon.code;
    }

    const payableAmount = Math.max(0, Number(plan.amount) - discountAmount);

    // Dates are set now; admin approval resets them to the actual activation date
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.validityDays);

    const membership = await this.prisma.$transaction(async (tx) => {
      return tx.membership.upsert({
        where: { employeeId: employee.id },
        update: {
          planType: plan.planKey,
          planName: plan.planName,
          amount: payableAmount,
          couponCode,
          discountAmount,
          startDate,
          endDate,
          status: 'PENDING',
          verifiedAt: null,
          verifiedBy: null,
          paymentReference: dto.paymentReference ?? null,
          paymentScreenshot: dto.paymentScreenshot ?? null,
          remarks: null,
        },
        create: {
          employeeId: employee.id,
          planType: plan.planKey,
          planName: plan.planName,
          amount: payableAmount,
          couponCode,
          discountAmount,
          startDate,
          endDate,
          status: 'PENDING',
          paymentReference: dto.paymentReference ?? null,
          paymentScreenshot: dto.paymentScreenshot ?? null,
        },
      });
    });

    return {
      success: true,
      message: 'Membership payment submitted for verification',
      membership,
    };
  }

  async findPending(query: MembershipListQueryDto = {}) {
    return this.findAll({ ...query, status: 'PENDING' });
  }

  async approve(membershipId: string, adminUserId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) throw new NotFoundException('Membership not found');
    if (membership.status === 'ACTIVE')
      throw new BadRequestException('Membership already approved');

    // Validity comes from the DB plan — always up-to-date regardless of when the plan was defined
    const plan = await this.getPlanOrDefault(membership.planType);
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.validityDays);

    const updatedMembership = await this.prisma.$transaction(async (tx) => {
      if (membership.couponCode) {
        const coupon = await tx.membershipCoupon.findUnique({
          where: { code: membership.couponCode },
        });
        if (coupon) {
          await tx.membershipCoupon.update({
            where: { id: coupon.id },
            data: { usedCount: { increment: 1 } },
          });
        }
      }

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

    // Post-transaction: notifications + email
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
    const waitingRequests = await this.prisma.salaryRequest.findMany({
      where: {
        employeeId: membership.employeeId,
        status: 'AWAITING_MEMBERSHIP_PAYMENT',
      },
      include: { employee: true },
    });

    if (waitingRequests.length > 0) {
      await this.prisma.salaryRequest.updateMany({
        where: {
          employeeId: membership.employeeId,
          status: 'AWAITING_MEMBERSHIP_PAYMENT',
        },
        data: { status: 'READY_FOR_DISBURSAL' },
      });

      await this.prisma.salaryRequestHistory.createMany({
        data: waitingRequests.map((request) => ({
          salaryRequestId: request.id,
          previousStatus: request.status,
          newStatus: 'READY_FOR_DISBURSAL',
          changedBy: adminUserId,
          actorRole: 'ADMIN',
          remarks: 'Membership approved; request ready for disbursal',
        })),
      });

      if (updatedMembership.employee?.userId) {
        await this.notificationsService
          .createSystemNotification(
            updatedMembership.employee.userId,
            'Advance Request Ready for Disbursal',
            'Your membership is now active. Your salary advance request has been moved to Ready for Disbursal.',
          )
          .catch((err) => console.error('Advance ready notification error', err));
      }

      const admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true },
      });

      const emp = waitingRequests[0]?.employee;
      if (emp) {
        await Promise.all(
          admins.map((admin) =>
            this.notificationsService
              .createSystemNotification(
                admin.id,
                'Salary Request Ready for Disbursal',
                `${emp.name}'s membership has been activated. Their salary advance request is now ready for disbursal.`,
              )
              .catch((err) =>
                console.error('Admin disbursal notification error', err),
              ),
          ),
        );
      }
    }

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
      data: { status: 'PENDING', remarks },
    });

    await this.auditLogsService.log({
      userId: actorUserId,
      action: 'MEMBERSHIP_REJECTED',
      entityType: 'MEMBERSHIP',
      entityId: membershipId,
      oldValue: { status: membership.status, remarks: membership.remarks },
      newValue: { status: updated.status, remarks: updated.remarks },
    });

    if (membership.employee?.userId) {
      await this.notificationsService
        .createSystemNotification(
          membership.employee.userId,
          'Membership Not Approved',
          remarks ||
            'Your membership payment proof needs an update. Please upload it again.',
        )
        .catch((err) => console.error('Membership rejected notification error', err));
    }

    try {
      await this.emailService.sendMembershipRejectedEmail({
        to: membership.employee.email,
        employeeName: membership.employee.name,
        remarks,
      });
    } catch (err) {
      console.error('Failed to send membership rejected email', err);
    }

    return updated;
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
      include: { employee: true },
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
              { paymentReference: containsSearch(query) },
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
        include: { employee: { include: { employer: true } } },
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
      (sum, m) => sum + Number(m.amount),
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
      summary.membershipRevenue += Number(membership.amount);
    }

    return Array.from(employerMap.values()).sort(
      (a, b) => b.membershipRevenue - a.membershipRevenue,
    );
  }

  async getRevenueSummary() {
    const memberships = await this.prisma.membership.findMany();
    const repayments = await this.prisma.repayment.findMany();

    const membershipRevenue = memberships.reduce(
      (sum, m) => sum + Number(m.amount),
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
    const [plans, settings] = await Promise.all([
      this.getActivePlansConfig(),
      this.prisma.setting.findMany({
        where: {
          key: {
            in: [
              'MEMBERSHIP_BENEFITS',
              'MEMBERSHIP_PAYMENT_UPI_ID',
              'MEMBERSHIP_PAYMENT_QR_URL',
              'MEMBERSHIP_PAYMENT_BENEFICIARY',
              'MEMBERSHIP_PAYMENT_INSTRUCTIONS',
            ],
          },
        },
      }),
    ]);

    const getValue = (key: string) => settings.find((s) => s.key === key)?.value;

    const membershipBenefitsRaw = getValue('MEMBERSHIP_BENEFITS');

    return {
      plans,
      membershipBenefits: membershipBenefitsRaw
        ? (JSON.parse(membershipBenefitsRaw) as string[])
        : [
            'Advances up to 50% of salary, instantly',
            'Zero processing fees on every advance',
            'Auto-recovery on payday — no EMIs',
            'Priority chat support',
          ],
      payment: {
        upiId: getValue('MEMBERSHIP_PAYMENT_UPI_ID') ?? '',
        qrUrl: getValue('MEMBERSHIP_PAYMENT_QR_URL') ?? '',
        beneficiaryName: getValue('MEMBERSHIP_PAYMENT_BENEFICIARY') ?? 'MobPae',
        instructions:
          getValue('MEMBERSHIP_PAYMENT_INSTRUCTIONS') ??
          'Pay using UPI and upload the payment screenshot for admin verification.',
      },
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

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
   * Fetches a plan by key. Falls back to MONTHLY if the key is no longer active
   * (guards against edge-cases where a plan is deactivated after a membership was created).
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
