import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    let employeeId: string | undefined;

    /**
     * Employee Validation
     */
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

    /**
     * Employer Validation
     */
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

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      employeeId,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
    };
  }
}
