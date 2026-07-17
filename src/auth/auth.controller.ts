import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 20, ttl: 15 * 60 * 1000 } })
  @ApiOperation({ summary: 'Login and create a single active user session' })
  @ApiResponse({
    status: 201,
    description: 'Login successful',
    schema: {
      example: {
        accessToken: 'jwt-access-token',
        refreshToken: 'session-id.refresh-token-secret',
        user: {
          id: 'user-id',
          email: 'admin@mobpae.com',
          role: 'ADMIN',
          employeeId: null,
          passwordChanged: true,
          lastLoginAt: '2026-07-13T08:00:00.000Z',
        },
      },
    },
  })
  async login(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.login(dto.email, dto.password, this.getMeta(req));
  }

  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60 * 1000 } })
  @ApiOperation({ summary: 'Refresh access token and rotate refresh token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 201,
    description: 'Token refreshed',
    schema: {
      example: {
        accessToken: 'new-jwt-access-token',
        refreshToken: 'session-id.new-refresh-token-secret',
        user: {
          id: 'user-id',
          email: 'admin@mobpae.com',
          role: 'ADMIN',
          employeeId: null,
          passwordChanged: true,
          lastLoginAt: '2026-07-13T08:00:00.000Z',
        },
      },
    },
  })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: any) {
    return this.authService.refresh(dto.refreshToken, this.getMeta(req));
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  @ApiOperation({ summary: 'Request password reset link' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        success: true,
        message: 'If the email exists, a reset link has been sent.',
      },
    },
  })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: any) {
    return this.authService.forgotPassword(dto.email, this.getMeta(req));
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  @ApiOperation({ summary: 'Reset password using a forgot-password token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        success: true,
        message: 'Password reset successfully. Please log in again.',
      },
    },
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and deactivate current session' })
  @ApiBody({ type: LogoutDto })
  @ApiResponse({
    status: 201,
    description: 'Logout successful',
    schema: {
      example: {
        success: true,
        message: 'Logged out successfully',
      },
    },
  })
  logout(@Req() req: any, @Body() dto: LogoutDto) {
    return this.authService.logout(
      req.user.userId,
      req.user.sessionId,
      dto.refreshToken,
      this.getMeta(req),
    );
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password and invalidate active sessions' })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        success: true,
        message: 'Password changed successfully. Please log in again.',
      },
    },
  })
  changePassword(
    @Req() req: any,
    @Body()
    dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      req.user.userId,
      dto.currentPassword,
      dto.newPassword,
      this.getMeta(req),
    );
  }

  @Post('accept-terms')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record that the user has accepted Terms & Conditions' })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  async acceptTerms(@Req() req: any) {
    await this.authService.acceptTerms(req.user.userId);
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        userId: 'user-id',
        email: 'employee@northstar.com',
        role: 'EMPLOYEE',
        employeeId: 'employee-id',
        sessionId: 'session-id',
        lastLoginAt: '2026-07-13T08:00:00.000Z',
      },
    },
  })
  getProfile(@Req() req: any) {
    return this.authService.getCurrentUserProfile(req.user, req.user.sessionId);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions for current user' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        sessions: [
          {
            id: 'session-id',
            current: true,
            device: 'Chrome on macOS',
            ipAddress: '103.21.244.10',
            loginAt: '2026-07-10T09:15:00.000Z',
            lastActiveAt: '2026-07-14T11:02:00.000Z',
          },
        ],
      },
    },
  })
  getSessions(@Req() req: any) {
    return this.authService.listSessions(req.user.userId, req.user.sessionId);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke one active session for current user' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        success: true,
        message: 'Session revoked successfully',
      },
    },
  })
  revokeSession(@Param('id') id: string, @Req() req: any) {
    return this.authService.revokeSession(
      req.user.userId,
      id,
      req.user.sessionId,
      this.getMeta(req),
    );
  }

  private getMeta(req: any) {
    return {
      ipAddress: req.ip,
      deviceInfo: req.headers['user-agent'],
    };
  }
}
