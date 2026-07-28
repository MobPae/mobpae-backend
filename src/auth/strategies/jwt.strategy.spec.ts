import { UnauthorizedException } from '@nestjs/common';

import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const employerUser = { id: 'user-1', isActive: true, role: 'EMPLOYER' };
  const payload = { sub: 'user-1', sessionId: 'session-1' };
  const activeSession = { id: 'session-1', isActive: true, userId: 'user-1' };

  function buildStrategy(overrides: {
    employerMember?: any;
    employer?: any;
  }) {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(employerUser) },
      employee: { findUnique: jest.fn() },
      employerMember: {
        findFirst: jest.fn().mockResolvedValue(overrides.employerMember ?? null),
      },
      employer: {
        findUnique: jest.fn().mockResolvedValue(overrides.employer ?? null),
      },
      userSession: { findUnique: jest.fn().mockResolvedValue(activeSession) },
    };
    const strategy = new JwtStrategy(prisma as any);
    return { strategy, prisma };
  }

  it('authenticates via an ACTIVE EmployerMember row', async () => {
    const { strategy } = buildStrategy({
      employerMember: {
        employerId: 'employer-1',
        role: 'ADMIN',
        status: 'ACTIVE',
        officeCode: 'BLR',
        employer: { id: 'employer-1', status: 'ACTIVE' },
      },
    });

    const result = await strategy.validate(payload);
    expect(result.employerId).toBe('employer-1');
    expect(result.employerRole).toBe('ADMIN');
  });

  it('denies a SUSPENDED EmployerMember row even when the user is also the legacy Employer.userId owner', async () => {
    const { strategy, prisma } = buildStrategy({
      employerMember: {
        employerId: 'employer-1',
        role: 'OWNER',
        status: 'SUSPENDED',
        officeCode: null,
        employer: { id: 'employer-1', status: 'ACTIVE' },
      },
      employer: { id: 'employer-1', userId: 'user-1', status: 'ACTIVE' },
    });

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
    // Must not fall through to the legacy Employer.userId lookup once an
    // EmployerMember row is found for this user.
    expect(prisma.employer.findUnique).not.toHaveBeenCalled();
  });

  it('denies a REMOVED EmployerMember row', async () => {
    const { strategy } = buildStrategy({
      employerMember: {
        employerId: 'employer-1',
        role: 'ADMIN',
        status: 'REMOVED',
        officeCode: null,
        employer: { id: 'employer-1', status: 'ACTIVE' },
      },
    });

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('falls back to legacy Employer.userId when no EmployerMember row exists at all', async () => {
    const { strategy } = buildStrategy({
      employerMember: null,
      employer: { id: 'employer-1', userId: 'user-1', status: 'ACTIVE' },
    });

    const result = await strategy.validate(payload);
    expect(result.employerId).toBe('employer-1');
  });

  it('denies when no EmployerMember row exists and the legacy employer is inactive', async () => {
    const { strategy } = buildStrategy({
      employerMember: null,
      employer: { id: 'employer-1', userId: 'user-1', status: 'SUSPENDED' },
    });

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
