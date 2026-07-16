import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { EmployerRole, EmployerMemberStatus, InviteStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PermissionService } from '../auth/permissions';
import { CreateInviteDto } from './dto/create-invite.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

const INVITE_EXPIRY_HOURS = 72;
const MAX_RESEND_COUNT = 3;

@Injectable()
export class EmployerMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly auditLogs: AuditLogsService,
    private readonly permissionService: PermissionService,
  ) {}

  // ─── Invites ──────────────────────────────────────────────────────────────

  async createInvite(
    actorUserId: string,
    actorRole: EmployerRole,
    employerId: string,
    dto: CreateInviteDto,
  ) {
    // Actor cannot invite to a role equal or above their own
    if (!this.permissionService.canManageRole(actorRole, dto.role)) {
      throw new ForbiddenException(
        'You cannot invite someone to a role equal or higher than your own',
      );
    }

    // Check the invitee is not already a member
    const existingMember = await this.prisma.employerMember.findFirst({
      where: {
        employerId,
        user: { email: dto.email },
        status: { not: EmployerMemberStatus.REMOVED },
      },
    });
    if (existingMember) {
      throw new ConflictException('This user is already a member of your organisation');
    }

    // Revoke any existing PENDING invite for the same email + employer
    await this.prisma.employerInvite.updateMany({
      where: { employerId, email: dto.email, status: InviteStatus.PENDING },
      data: { status: InviteStatus.REVOKED, revokedAt: new Date() },
    });

    // Generate token: raw (emailed) + hash (stored)
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

    const invite = await this.prisma.employerInvite.create({
      data: {
        employerId,
        email: dto.email,
        role: dto.role,
        tokenHash,
        expiresAt,
        invitedByUserId: actorUserId,
        lastSentAt: new Date(),
      },
      include: { employer: { select: { companyName: true } } },
    });

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { email: true },
    });

    const acceptUrl = `${process.env.EMPLOYER_PORTAL_URL}/invite/accept?token=${rawToken}`;

    try {
      await this.emailService.sendEmployerInviteEmail({
        to: dto.email,
        inviteeName: dto.email,
        companyName: invite.employer.companyName,
        invitedBy: actor?.email ?? 'MobPae',
        role: dto.role,
        acceptUrl,
        expiryHours: INVITE_EXPIRY_HOURS,
      });
    } catch {
      // Non-blocking — invite is created even if email fails
    }

    await this.auditLogs.log({
      userId: actorUserId,
      action: 'EMPLOYER_INVITE_SENT',
      entityType: 'EmployerInvite',
      entityId: invite.id,
      newValue: { email: dto.email, role: dto.role, employerId },
    });

    return { id: invite.id, email: invite.email, role: invite.role, expiresAt };
  }

  /** Public — returns invite metadata so the frontend can render a preview before the user sets a password. */
  async previewInvite(rawToken: string) {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const invite = await this.prisma.employerInvite.findUnique({
      where: { tokenHash },
      include: { employer: { select: { companyName: true } } },
    });

    if (!invite || invite.status !== InviteStatus.PENDING) {
      throw new NotFoundException('Invite not found or already used');
    }

    if (invite.expiresAt < new Date()) {
      await this.prisma.employerInvite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.EXPIRED },
      });
      throw new BadRequestException('Invite has expired');
    }

    return {
      email: invite.email,
      role: invite.role,
      companyName: invite.employer.companyName,
      expiresAt: invite.expiresAt,
    };
  }

  async acceptInvite(rawToken: string, newPassword: string) {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const invite = await this.prisma.employerInvite.findUnique({
      where: { tokenHash },
      include: { employer: { select: { id: true, status: true, companyName: true } } },
    });

    if (!invite || invite.status !== InviteStatus.PENDING) {
      throw new NotFoundException('Invite not found or already used');
    }

    if (invite.expiresAt < new Date()) {
      await this.prisma.employerInvite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.EXPIRED },
      });
      throw new BadRequestException('Invite has expired. Please ask to be re-invited.');
    }

    if (invite.employer.status !== 'ACTIVE') {
      throw new ForbiddenException('This employer account is not active');
    }

    // Find or create the User account for the invitee
    let user = await this.prisma.user.findUnique({ where: { email: invite.email } });

    const bcrypt = await import('bcrypt');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await this.prisma.$transaction(async (tx) => {
      if (!user) {
        user = await tx.user.create({
          data: {
            email: invite.email,
            password: hashedPassword,
            role: 'EMPLOYER',
            passwordChanged: true,
            passwordChangedAt: new Date(),
          },
        });
      }

      // Upsert the EmployerMember record
      const member = await tx.employerMember.upsert({
        where: { employerId_userId: { employerId: invite.employerId, userId: user!.id } },
        update: { role: invite.role, status: EmployerMemberStatus.ACTIVE },
        create: {
          employerId: invite.employerId,
          userId: user!.id,
          role: invite.role,
          status: EmployerMemberStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });

      // Mark invite as accepted
      await tx.employerInvite.update({
        where: { id: invite.id },
        data: {
          status: InviteStatus.ACCEPTED,
          acceptedAt: new Date(),
          acceptedByUserId: user!.id,
        },
      });

      return { user, member };
    });

    await this.auditLogs.log({
      userId: result.user.id,
      action: 'EMPLOYER_INVITE_ACCEPTED',
      entityType: 'EmployerInvite',
      entityId: invite.id,
      newValue: { role: invite.role, employerId: invite.employerId },
    });

    return {
      message: 'Invite accepted. You can now sign in.',
      email: invite.email,
    };
  }

  async resendInvite(
    actorUserId: string,
    inviteId: string,
    employerId: string,
  ) {
    const invite = await this.prisma.employerInvite.findUnique({
      where: { id: inviteId },
      include: { employer: { select: { companyName: true } } },
    });

    if (!invite || invite.employerId !== employerId) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.status !== InviteStatus.PENDING) {
      throw new BadRequestException('Only pending invites can be resent');
    }

    if (invite.resendCount >= MAX_RESEND_COUNT) {
      throw new BadRequestException(
        `Maximum resend limit (${MAX_RESEND_COUNT}) reached. Revoke and create a new invite.`,
      );
    }

    // Re-generate token to reset expiry
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

    await this.prisma.employerInvite.update({
      where: { id: invite.id },
      data: {
        tokenHash,
        expiresAt,
        resendCount: { increment: 1 },
        lastSentAt: new Date(),
      },
    });

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { email: true },
    });

    const acceptUrl = `${process.env.EMPLOYER_PORTAL_URL}/invite/accept?token=${rawToken}`;

    try {
      await this.emailService.sendEmployerInviteEmail({
        to: invite.email,
        inviteeName: invite.email,
        companyName: invite.employer.companyName,
        invitedBy: actor?.email ?? 'MobPae',
        role: invite.role,
        acceptUrl,
        expiryHours: INVITE_EXPIRY_HOURS,
      });
    } catch {
      // Non-blocking
    }

    return { message: 'Invite resent successfully' };
  }

  async revokeInvite(inviteId: string, employerId: string, actorUserId: string) {
    const invite = await this.prisma.employerInvite.findUnique({
      where: { id: inviteId },
    });

    if (!invite || invite.employerId !== employerId) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.status !== InviteStatus.PENDING) {
      throw new BadRequestException('Only pending invites can be revoked');
    }

    await this.prisma.employerInvite.update({
      where: { id: invite.id },
      data: { status: InviteStatus.REVOKED, revokedAt: new Date() },
    });

    await this.auditLogs.log({
      userId: actorUserId,
      action: 'EMPLOYER_INVITE_REVOKED',
      entityType: 'EmployerInvite',
      entityId: invite.id,
    });

    return { message: 'Invite revoked' };
  }

  async listInvites(employerId: string) {
    return this.prisma.employerInvite.findMany({
      where: { employerId, status: InviteStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        resendCount: true,
        lastSentAt: true,
        createdAt: true,
        invitedByUser: { select: { email: true } },
      },
    });
  }

  // ─── Members ──────────────────────────────────────────────────────────────

  async listMembers(employerId: string) {
    return this.prisma.employerMember.findMany({
      where: {
        employerId,
        status: { not: EmployerMemberStatus.REMOVED },
      },
      orderBy: { joinedAt: 'asc' },
      select: {
        id: true,
        role: true,
        status: true,
        officeCode: true,
        joinedAt: true,
        user: { select: { id: true, email: true, lastLogin: true } },
      },
    });
  }

  async updateMemberRole(
    actorUserId: string,
    actorRole: EmployerRole,
    memberId: string,
    employerId: string,
    dto: UpdateMemberRoleDto,
  ) {
    const member = await this.requireMember(memberId, employerId);

    // Cannot touch the OWNER unless you are an OWNER yourself
    if (
      member.role === EmployerRole.OWNER &&
      actorRole !== EmployerRole.OWNER
    ) {
      throw new ForbiddenException("Only an OWNER can modify another OWNER's role");
    }

    // Cannot assign a role equal or above your own
    if (!this.permissionService.canManageRole(actorRole, dto.role)) {
      throw new ForbiddenException(
        'You cannot assign a role equal or higher than your own',
      );
    }

    // Prevent leaving org with no OWNER
    if (member.role === EmployerRole.OWNER && dto.role !== EmployerRole.OWNER) {
      const ownerCount = await this.prisma.employerMember.count({
        where: { employerId, role: EmployerRole.OWNER, status: EmployerMemberStatus.ACTIVE },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException(
          'Cannot demote the last OWNER. Assign another OWNER first.',
        );
      }
    }

    const updated = await this.prisma.employerMember.update({
      where: { id: memberId },
      data: { role: dto.role },
    });

    await this.auditLogs.log({
      userId: actorUserId,
      action: 'EMPLOYER_MEMBER_ROLE_CHANGED',
      entityType: 'EmployerMember',
      entityId: memberId,
      oldValue: { role: member.role },
      newValue: { role: dto.role },
    });

    return { id: updated.id, role: updated.role };
  }

  async suspendMember(
    actorUserId: string,
    actorRole: EmployerRole,
    memberId: string,
    employerId: string,
  ) {
    const member = await this.requireMember(memberId, employerId);

    if (member.userId === actorUserId) {
      throw new BadRequestException('You cannot suspend yourself');
    }

    if (member.role === EmployerRole.OWNER && actorRole !== EmployerRole.OWNER) {
      throw new ForbiddenException('Only an OWNER can suspend another OWNER');
    }

    await this.prisma.employerMember.update({
      where: { id: memberId },
      data: { status: EmployerMemberStatus.SUSPENDED },
    });

    await this.auditLogs.log({
      userId: actorUserId,
      action: 'EMPLOYER_MEMBER_SUSPENDED',
      entityType: 'EmployerMember',
      entityId: memberId,
    });

    return { message: 'Member suspended' };
  }

  async removeMember(
    actorUserId: string,
    actorRole: EmployerRole,
    memberId: string,
    employerId: string,
  ) {
    const member = await this.requireMember(memberId, employerId);

    if (member.userId === actorUserId) {
      throw new BadRequestException('You cannot remove yourself');
    }

    if (member.role === EmployerRole.OWNER) {
      // Guard: can't remove the last OWNER
      const ownerCount = await this.prisma.employerMember.count({
        where: { employerId, role: EmployerRole.OWNER, status: EmployerMemberStatus.ACTIVE },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException(
          'Cannot remove the last OWNER. Assign another OWNER first.',
        );
      }

      if (actorRole !== EmployerRole.OWNER) {
        throw new ForbiddenException('Only an OWNER can remove another OWNER');
      }
    }

    await this.prisma.employerMember.update({
      where: { id: memberId },
      data: { status: EmployerMemberStatus.REMOVED, removedAt: new Date() },
    });

    await this.auditLogs.log({
      userId: actorUserId,
      action: 'EMPLOYER_MEMBER_REMOVED',
      entityType: 'EmployerMember',
      entityId: memberId,
    });

    return { message: 'Member removed' };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async requireMember(memberId: string, employerId: string) {
    const member = await this.prisma.employerMember.findUnique({
      where: { id: memberId },
    });

    if (!member || member.employerId !== employerId) {
      throw new NotFoundException('Member not found');
    }

    if (member.status === EmployerMemberStatus.REMOVED) {
      throw new BadRequestException('Member has already been removed');
    }

    return member;
  }
}
