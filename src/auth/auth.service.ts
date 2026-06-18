import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';

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
    private prisma: PrismaService,
  ) {}

  async login(email: string, password: string, meta: RequestMeta = {}) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      await this.writeAuthAudit('LOGIN_FAILED', {
        email,
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
      user: authUser,
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

    await this.prisma.userSession.update({
      where: {
        id: session.id,
      },
      data: {
        refreshToken: await bcrypt.hash(newRefreshToken, 10),
        deviceInfo: meta.deviceInfo ?? session.deviceInfo,
        ipAddress: meta.ipAddress ?? session.ipAddress,
        isActive: true,
      },
    });

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
      user: authUser,
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
    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user || !user.isActive) {
      await this.writeAuthAudit('LOGIN_FAILED', {
        userId: user?.id,
        email,
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
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

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

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          password: hashedPassword,
          passwordChanged: true,
        },
      }),
      this.prisma.userSession.updateMany({
        where: {
          userId: user.id,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      }),
    ]);

    await this.writeAuthAudit('PASSWORD_CHANGED', {
      userId: user.id,
      email: user.email,
      meta,
    });

    return {
      success: true,
      message: 'Password changed successfully. Please log in again.',
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

  private async writeAuthAudit(
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
      meta?: RequestMeta;
      details?: Record<string, unknown>;
    },
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: data.userId,
          action,
          entityType: 'AUTH',
          entityId: data.userId ?? data.email ?? 'unknown',
          newValue: {
            email: data.email,
            ipAddress: data.meta?.ipAddress,
            deviceInfo: data.meta?.deviceInfo,
            timestamp: new Date().toISOString(),
            ...data.details,
          },
        },
      });
    } catch (error) {
      console.error('Failed to write auth audit log', error);
    }
  }
}
