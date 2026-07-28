import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('should be defined', () => {
    const service = new AuthService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    expect(service).toBeDefined();
  });

  describe('login timing (email enumeration)', () => {
    function buildService(user: any) {
      const usersService = { findByEmail: jest.fn().mockResolvedValue(user) };
      const audit = { logAuth: jest.fn().mockResolvedValue(undefined) };
      const prisma = {
        user: { update: jest.fn().mockResolvedValue(undefined) },
      };
      const service = new AuthService(
        usersService as any,
        {} as any,
        {} as any,
        audit as any,
        prisma as any,
      );
      return { service, audit };
    }

    it('rejects an unknown email with the same error and does not short-circuit before hashing', async () => {
      const { service, audit } = buildService(null);

      await expect(
        service.login('unknown@example.com', 'whatever'),
      ).rejects.toThrow(UnauthorizedException);

      expect(audit.logAuth).toHaveBeenCalledWith(
        'LOGIN_FAILED',
        expect.objectContaining({
          details: { reason: 'USER_NOT_FOUND' },
        }),
      );
    });

    it('still rejects a wrong password for a real user with the correct audit reason', async () => {
      const realHash = await bcrypt.hash('correct-password', 10);
      const { service, audit } = buildService({
        id: 'user-1',
        email: 'user@example.com',
        password: realHash,
      });

      await expect(
        service.login('user@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);

      expect(audit.logAuth).toHaveBeenCalledWith(
        'LOGIN_FAILED',
        expect.objectContaining({
          details: { reason: 'INVALID_PASSWORD' },
        }),
      );
    });
  });

  describe('forgotPassword audit action (regression: was misfiled as LOGIN_FAILED)', () => {
    it('logs an unknown email under PASSWORD_RESET_REQUESTED, not LOGIN_FAILED', async () => {
      const audit = { logAuth: jest.fn().mockResolvedValue(undefined) };
      const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
      const service = new AuthService(
        {} as any,
        {} as any,
        {} as any,
        audit as any,
        prisma as any,
      );

      const result = await service.forgotPassword('unknown@example.com');

      expect(result.success).toBe(true);
      expect(audit.logAuth).toHaveBeenCalledWith(
        'PASSWORD_RESET_REQUESTED',
        expect.objectContaining({
          details: { reason: 'PASSWORD_RESET_USER_NOT_FOUND' },
        }),
      );
      expect(audit.logAuth).not.toHaveBeenCalledWith(
        'LOGIN_FAILED',
        expect.anything(),
      );
    });
  });
});
