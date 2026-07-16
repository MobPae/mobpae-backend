import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EmployerRole } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmployerPermissionGuard } from '../auth/guards/employer-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../auth/permissions';
import { EmployerMembersService } from './employer-members.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

// Shorthand request user type for employer portal
type EmployerRequest = Request & {
  user: {
    userId: string;
    employerId: string;
    employerRole: EmployerRole;
  };
};

@Controller('employer-members')
export class EmployerMembersController {
  constructor(private readonly service: EmployerMembersService) {}

  // ─── Invites ──────────────────────────────────────────────────────────────

  /** List pending invites for this employer */
  @Get('invites')
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.MEMBER_VIEW)
  listInvites(@Req() req: EmployerRequest) {
    return this.service.listInvites(req.user.employerId);
  }

  /** Send a new invite */
  @Post('invites')
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.MEMBER_INVITE)
  createInvite(@Req() req: EmployerRequest, @Body() dto: CreateInviteDto) {
    return this.service.createInvite(
      req.user.userId,
      req.user.employerRole,
      req.user.employerId,
      dto,
    );
  }

  /**
   * Preview an invite — public endpoint (no auth guard).
   * Returns company name + role so the frontend can render a preview before the user sets a password.
   */
  @Get('invites/preview')
  @Throttle({ default: { limit: 20, ttl: 15 * 60 * 1000 } })
  previewInvite(@Query('token') token: string) {
    return this.service.previewInvite(token);
  }

  /**
   * Accept an invite — public endpoint (no auth guard).
   * The token in the body is the raw token from the invite email.
   * Strict limit — this creates a user account.
   */
  @Post('invites/accept')
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.service.acceptInvite(dto.token, dto.password);
  }

  /** Resend a pending invite (regenerates token + resets expiry) */
  @Post('invites/:id/resend')
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.MEMBER_INVITE)
  resendInvite(@Req() req: EmployerRequest, @Param('id') inviteId: string) {
    return this.service.resendInvite(
      req.user.userId,
      inviteId,
      req.user.employerId,
    );
  }

  /** Revoke a pending invite */
  @Delete('invites/:id')
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.MEMBER_INVITE)
  revokeInvite(@Req() req: EmployerRequest, @Param('id') inviteId: string) {
    return this.service.revokeInvite(
      inviteId,
      req.user.employerId,
      req.user.userId,
    );
  }

  // ─── Members ──────────────────────────────────────────────────────────────

  /** List all active + suspended members */
  @Get()
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.MEMBER_VIEW)
  listMembers(@Req() req: EmployerRequest) {
    return this.service.listMembers(req.user.employerId);
  }

  /** Change a member's role */
  @Patch(':id/role')
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.MEMBER_MANAGE)
  updateMemberRole(
    @Req() req: EmployerRequest,
    @Param('id') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.service.updateMemberRole(
      req.user.userId,
      req.user.employerRole,
      memberId,
      req.user.employerId,
      dto,
    );
  }

  /** Suspend a member (reversible) */
  @Patch(':id/suspend')
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.MEMBER_MANAGE)
  suspendMember(@Req() req: EmployerRequest, @Param('id') memberId: string) {
    return this.service.suspendMember(
      req.user.userId,
      req.user.employerRole,
      memberId,
      req.user.employerId,
    );
  }

  /** Permanently remove a member */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
  @RequirePermission(Permission.MEMBER_MANAGE)
  removeMember(@Req() req: EmployerRequest, @Param('id') memberId: string) {
    return this.service.removeMember(
      req.user.userId,
      req.user.employerRole,
      memberId,
      req.user.employerId,
    );
  }
}
