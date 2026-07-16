import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive');
    }

    if (user.role === 'EMPLOYEE') {
      const employee = await this.prisma.employee.findUnique({
        where: {
          userId: user.id,
        },
      });

      if (
        !employee ||
        employee.employmentStatus !== 'ACTIVE' ||
        !employee.appActivated
      ) {
        throw new UnauthorizedException('Employee account is inactive');
      }
    }

    // ── Employer: resolve via EmployerMember (multi-user portal) ─────────────
    let employerId: string | undefined;
    let employerRole: string | undefined;
    let officeCode: string | undefined;

    if (user.role === 'EMPLOYER') {
      // Prefer EmployerMember lookup (post-migration path).
      // Fall back to legacy Employer.userId if seed hasn't run yet.
      const member = await this.prisma.employerMember.findFirst({
        where: { userId: user.id, status: 'ACTIVE' },
        include: { employer: { select: { id: true, status: true } } },
      });

      if (member) {
        if (member.employer.status !== 'ACTIVE') {
          throw new UnauthorizedException('Employer account is inactive');
        }
        employerId = member.employerId;
        employerRole = member.role;
        officeCode = member.officeCode ?? undefined;
      } else {
        // Legacy fallback — Employer created before invite system
        const employer = await this.prisma.employer.findUnique({
          where: { userId: user.id },
        });
        if (!employer || employer.status !== 'ACTIVE') {
          throw new UnauthorizedException('Employer account is inactive');
        }
        employerId = employer.id;
      }
    }

    if (!payload.sessionId) {
      throw new UnauthorizedException('Invalid session');
    }

    const session = await this.prisma.userSession.findUnique({
      where: {
        id: payload.sessionId,
      },
    });

    if (!session || !session.isActive || session.userId !== user.id) {
      throw new UnauthorizedException('Invalid session');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      employeeId: payload.employeeId,
      sessionId: payload.sessionId,
      // Employer portal fields (undefined for ADMIN / EMPLOYEE)
      employerId,
      employerRole,
      officeCode,
    };
  }
}
