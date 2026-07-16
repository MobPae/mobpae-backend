import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EmployerRole } from '@prisma/client';
import {
  PERMISSION_KEY,
} from '../decorators/require-permission.decorator';
import { Permission, PermissionService } from '../permissions';

/**
 * Guard for employer portal endpoints.
 *
 * - Rejects any non-EMPLOYER user outright.
 * - If @RequirePermission() is set, checks that the member's role includes it.
 * - Blocks SUSPENDED / REMOVED members (already blocked at JWT validation,
 *   but this guard acts as a defence-in-depth layer).
 *
 * Must be used AFTER JwtAuthGuard so request.user is already populated.
 */
@Injectable()
export class EmployerPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as {
      role: string;
      employerRole?: string;
    };

    // Only EMPLOYER role users pass this guard
    if (user.role !== 'EMPLOYER') {
      throw new ForbiddenException('Access restricted to employer portal users');
    }

    const requiredPermission = this.reflector.getAllAndOverride<
      Permission | undefined
    >(PERMISSION_KEY, [context.getHandler(), context.getClass()]);

    // No specific permission required — just being an active EMPLOYER is enough
    if (!requiredPermission) {
      return true;
    }

    if (!user.employerRole) {
      throw new ForbiddenException('No employer role assigned');
    }

    const hasIt = this.permissionService.hasPermission(
      { role: user.employerRole as EmployerRole },
      requiredPermission,
    );

    if (!hasIt) {
      throw new ForbiddenException(
        `Your role does not have the '${requiredPermission}' permission`,
      );
    }

    return true;
  }
}
