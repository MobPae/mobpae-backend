import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { normalizeEmail } from '../common/utils/email.util';

type RequestMeta = {
  ipAddress?: string;
  deviceInfo?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly auditLogsService: AuditLogsService,
    private prisma: PrismaService,
  ) {}

  async login(email: string, password: string, meta: RequestMeta = {}) {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.usersService.findByEmail(normalizedEmail);

    if (!user) {
      await this.writeAuthAudit('LOGIN_FAILED', {
        email: normalizedEmail,
        meta,
        details: {
          reason: 'USER_NOT_FOUND',
        },
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      await this.writeAuthAudit('LOGIN_FAILED', {
        userId: user.id,
        email: user.email,
        meta,
        details: {
          reason: 'INVALID_PASSWORD',
        },
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    let authUser: Awaited<ReturnType<AuthService['getAuthUser']>>;

    try {
      authUser = await this.getAuthUser(user.id);
    } catch (error) {
      await this.writeAuthAudit('LOGIN_FAILED', {
        userId: user.id,
        email: user.email,
        meta,
        details: {
          reason: 'AUTHORIZATION_FAILED',
        },
      });

      throw error;
    }

    const previousLoginAt = user.lastLogin;
    const loginAt = new Date();
    const { accessToken, refreshToken } = await this.prisma.$transaction(
      async (tx) => {
        await tx.userSession.updateMany({
          where: {
            userId: user.id,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });

        const session = await tx.userSession.create({
          data: {
            userId: user.id,
            refreshToken: '',
            deviceInfo: meta.deviceInfo,
            ipAddress: meta.ipAddress,
          },
        });

        await tx.user.update({
          where: { id: user.id },
          data: { lastLogin: loginAt },
        });

        const refreshToken = this.buildRefreshToken(session.id);

        await tx.userSession.update({
          where: {
            id: session.id,
          },
          data: {
            refreshToken: await bcrypt.hash(refreshToken, 10),
          },
        });

        return {
          accessToken: await this.createAccessToken(authUser, session.id),
          refreshToken,
        };
      },
    );

    await this.writeAuthAudit('LOGIN_SUCCESS', {
      userId: user.id,
      email: user.email,
      meta,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        ...authUser,
        lastLoginAt: previousLoginAt,
      },
    };
  }

  async refresh(refreshToken: string, meta: RequestMeta = {}) {
    const sessionId = this.getSessionIdFromRefreshToken(refreshToken);

    if (!sessionId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.userSession.findUnique({
      where: {
        id: sessionId,
      },
      include: {
        user: true,
      },
    });

    if (!session || !session.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (this.isRefreshTokenExpired(session.createdAt)) {
      await this.prisma.userSession.update({
        where: {
          id: session.id,
        },
        data: {
          isActive: false,
        },
      });

      throw new UnauthorizedException('Refresh token expired');
    }

    const tokenMatches = await bcrypt.compare(
      refreshToken,
      session.refreshToken,
    );

    if (!tokenMatches) {
      await this.prisma.userSession.update({
        where: {
          id: session.id,
        },
        data: {
          isActive: false,
        },
      });

      throw new UnauthorizedException('Invalid refresh token');
    }

    const authUser = await this.getAuthUser(session.userId);
    const newRefreshToken = this.buildRefreshToken(session.id);
    const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);

    // Rotate using the currently stored token hash as a compare-and-swap guard.
    // If two refresh calls race, only one can replace this exact hash.
    const rotation = await this.prisma.userSession.updateMany({
      where: {
        id: session.id,
        isActive: true,
        refreshToken: session.refreshToken,
      },
      data: {
        refreshToken: newRefreshTokenHash,
        deviceInfo: meta.deviceInfo ?? session.deviceInfo,
        ipAddress: meta.ipAddress ?? session.ipAddress,
        isActive: true,
      },
    });

    if (rotation.count !== 1) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.writeAuthAudit('TOKEN_REFRESH', {
      userId: session.userId,
      email: session.user.email,
      meta,
      details: {
        sessionId: session.id,
      },
    });

    return {
      accessToken: await this.createAccessToken(authUser, session.id),
      refreshToken: newRefreshToken,
      user: {
        ...authUser,
        lastLoginAt: await this.getPreviousLoginAt(session.userId, session.id),
      },
    };
  }

  async getCurrentUserProfile(
    requestUser: {
      userId: string;
      email: string;
      role: string;
      employeeId?: string;
      sessionId: string;
    },
    currentSessionId: string,
  ) {
    return {
      ...requestUser,
      lastLoginAt: await this.getPreviousLoginAt(
        requestUser.userId,
        currentSessionId,
      ),
    };
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        current: session.id === currentSessionId,
        device: this.formatDevice(session.deviceInfo),
        ipAddress: session.ipAddress,
        loginAt: session.createdAt,
        lastActiveAt: session.updatedAt,
      })),
    };
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId: string,
    meta: RequestMeta = {},
  ) {
    const session = await this.prisma.userSession.findUnique({
      where: {
        id: sessionId,
      },
      select: {
        id: true,
        userId: true,
        isActive: true,
      },
    });

    if (!session || session.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (session.isActive) {
      await this.prisma.userSession.update({
        where: {
          id: session.id,
        },
        data: {
          isActive: false,
        },
      });
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        email: true,
      },
    });

    await this.writeAuthAudit('SESSION_REVOKED', {
      userId,
      email: user?.email,
      meta,
      details: {
        sessionId: session.id,
        current: session.id === currentSessionId,
      },
    });

    return {
      success: true,
      message: 'Session revoked successfully',
    };
  }

  async logout(
    userId: string,
    sessionId?: string,
    refreshToken?: string,
    meta: RequestMeta = {},
  ) {
    const refreshSessionId = refreshToken
      ? this.getSessionIdFromRefreshToken(refreshToken)
      : undefined;

    const targetSessionId = sessionId ?? refreshSessionId;

    if (targetSessionId) {
      await this.prisma.userSession.updateMany({
        where: {
          id: targetSessionId,
          userId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });
    } else {
      await this.prisma.userSession.updateMany({
        where: {
          userId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    await this.writeAuthAudit('LOGOUT', {
      userId,
      email: user?.email,
      meta,
      details: {
        sessionId: targetSessionId,
      },
    });

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  async forgotPassword(email: string, meta: RequestMeta = {}) {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (!user || !user.isActive) {
      await this.writeAuthAudit('LOGIN_FAILED', {
        userId: user?.id,
        email: normalizedEmail,
        meta,
        details: {
          reason: 'PASSWORD_RESET_USER_NOT_FOUND',
        },
      });

      return {
        success: true,
        message: 'If the email exists, a reset link has been sent.',
      };
    }

    const selector = randomBytes(12).toString('hex');
    const tokenSecret = randomBytes(48).toString('hex');
    const token = `${selector}.${tokenSecret}`;
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenSelector: selector,
          tokenHash: await bcrypt.hash(tokenSecret, 10),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
    });

    try {
      await this.emailService.sendForgotPasswordEmail({
        to: user.email,
        name: user.email,
        resetUrl,
      });
    } catch (error) {
      console.error('Failed to send forgot password email', error);
    }

    await this.writeAuthAudit('PASSWORD_RESET_REQUESTED', {
      userId: user.id,
      email: user.email,
      meta,
    });

    return {
      success: true,
      message: 'If the email exists, a reset link has been sent.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const [selector, tokenSecret] = token.split('.');

    if (!selector || !tokenSecret) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: {
        tokenSelector: selector,
      },
      include: {
        user: true,
      },
    });

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const tokenMatches = await bcrypt.compare(
      tokenSecret,
      resetToken.tokenHash,
    );

    if (!tokenMatches) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    if (await bcrypt.compare(newPassword, resetToken.user.password)) {
      throw new UnauthorizedException(
        'New password must be different from current password',
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id: resetToken.userId,
        },
        data: {
          password: hashedPassword,
          passwordChanged: true,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: {
          id: resetToken.id,
        },
        data: {
          usedAt: new Date(),
        },
      }),
      this.prisma.userSession.updateMany({
        where: {
          userId: resetToken.userId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      }),
    ]);

    try {
      await this.emailService.sendPasswordChangedEmail({
        to: resetToken.user.email,
        name: resetToken.user.email,
      });
    } catch (error) {
      console.error('Failed to send password changed email', error);
    }

    await this.writeAuthAudit('PASSWORD_RESET_COMPLETED', {
      userId: resetToken.userId,
      email: resetToken.user.email,
    });

    return {
      success: true,
      message: 'Password reset successfully. Please log in again.',
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    meta: RequestMeta = {},
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (await bcrypt.compare(newPassword, user.password)) {
      throw new UnauthorizedException(
        'New password must be different from current password',
      );
    }

    // Detect whether this is the forced first-time change (employer-set default password).
    // We read the flag BEFORE the update so we know which path to take.
    const isFirstChange = !user.passwordChanged;

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Step 1 — update password and invalidate all existing sessions.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, passwordChanged: true },
      }),
      this.prisma.userSession.updateMany({
        where: { userId: user.id, isActive: true },
        data: { isActive: false },
      }),
    ]);

    await this.writeAuthAudit('PASSWORD_CHANGED', {
      userId: user.id,
      email: user.email,
      meta,
    });

    // Step 2 — for first-time forced changes, create a brand-new session so the
    // user lands directly in the app without having to sign in again.
    if (isFirstChange) {
      const authUser = await this.getAuthUser(userId);

      const session = await this.prisma.userSession.create({
        data: {
          userId: user.id,
          refreshToken: '',
          deviceInfo: meta.deviceInfo,
          ipAddress: meta.ipAddress,
        },
      });

      const rawRefreshToken = this.buildRefreshToken(session.id);
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { refreshToken: await bcrypt.hash(rawRefreshToken, 10) },
      });

      return {
        success: true,
        accessToken: await this.createAccessToken(authUser, session.id),
        refreshToken: rawRefreshToken,
      };
    }

    // Voluntary password change — all sessions invalidated, user must sign in again.
    return {
      success: true,
      message: 'Password changed successfully. Please sign in again.',
    };
  }

  private async getAuthUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive');
    }

    let employeeId: string | undefined;

    if (user.role === 'EMPLOYEE') {
      const employee = await this.prisma.employee.findUnique({
        where: {
          userId: user.id,
        },
      });

      if (!employee) {
        throw new UnauthorizedException('Employee not found');
      }

      if (employee.employmentStatus !== 'ACTIVE') {
        throw new ForbiddenException(
          'Your employment status is inactive. Please contact your employer.',
        );
      }

      if (!employee.appActivated) {
        throw new ForbiddenException(
          'Your MobPae account has not been activated by your employer yet.',
        );
      }

      employeeId = employee.id;
    }

    if (user.role === 'EMPLOYER') {
      const employer = await this.prisma.employer.findUnique({
        where: {
          userId: user.id,
        },
      });

      if (!employer) {
        throw new UnauthorizedException('Employer not found');
      }

      if (employer.status !== 'ACTIVE') {
        throw new ForbiddenException(
          'Your employer account is pending approval.',
        );
      }
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      employeeId,
      passwordChanged: user.passwordChanged,
    };
  }

  private async createAccessToken(
    user: Awaited<ReturnType<AuthService['getAuthUser']>>,
    sessionId: string,
  ) {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        sessionId,
      },
      {
        expiresIn: '15m',
      },
    );
  }

  private buildRefreshToken(sessionId: string) {
    return `${sessionId}.${randomBytes(64).toString('hex')}`;
  }

  private getSessionIdFromRefreshToken(refreshToken: string) {
    const [sessionId] = refreshToken.split('.');

    return sessionId || undefined;
  }

  private isRefreshTokenExpired(createdAt: Date) {
    const refreshTokenLifetimeMs = 30 * 24 * 60 * 60 * 1000;

    return createdAt.getTime() + refreshTokenLifetimeMs < Date.now();
  }

  private async getPreviousLoginAt(userId: string, currentSessionId: string) {
    const previousSession = await this.prisma.userSession.findFirst({
      where: {
        userId,
        id: {
          not: currentSessionId,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        createdAt: true,
      },
    });

    return previousSession?.createdAt ?? null;
  }

  private formatDevice(userAgent?: string | null) {
    if (!userAgent) return 'Unknown device';

    const browser = userAgent.includes('Edg/')
      ? 'Edge'
      : userAgent.includes('OPR/')
        ? 'Opera'
        : userAgent.includes('Firefox/')
          ? 'Firefox'
          : userAgent.includes('CriOS/')
            ? 'Chrome'
            : userAgent.includes('Chrome/')
              ? 'Chrome'
              : userAgent.includes('Safari/')
                ? 'Safari'
                : 'Browser';

    const os = /iPhone|iPad|iPod/.test(userAgent)
      ? 'iOS'
      : userAgent.includes('Android')
        ? 'Android'
        : userAgent.includes('Mac OS X') || userAgent.includes('Macintosh')
          ? 'macOS'
          : userAgent.includes('Windows')
            ? 'Windows'
            : userAgent.includes('Linux')
              ? 'Linux'
              : 'device';

    return `${browser} on ${os}`;
  }

  private async writeAuthAudit(
    action:
      | 'LOGIN_SUCCESS'
      | 'LOGIN_FAILED'
      | 'LOGOUT'
      | 'TOKEN_REFRESH'
      | 'SESSION_REVOKED'
      | 'PASSWORD_RESET_REQUESTED'
      | 'PASSWORD_RESET_COMPLETED'
      | 'PASSWORD_CHANGED',
    data: {
      userId?: string;
      email?: string;
      meta?: RequestMeta;
      details?: Record<string, unknown>;
    },
  ) {
    await this.auditLogsService.logAuth(action, {
      userId: data.userId,
      email: data.email,
      ipAddress: data.meta?.ipAddress,
      deviceInfo: data.meta?.deviceInfo,
      details: data.details,
    });
  }
}
