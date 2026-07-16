import { SetMetadata } from '@nestjs/common';
import { Permission } from '../permissions';

export const PERMISSION_KEY = 'required_permission';

/**
 * Requires the authenticated EmployerMember to have a specific permission.
 * Use alongside JwtAuthGuard + EmployerPermissionGuard.
 *
 * @example
 * @UseGuards(JwtAuthGuard, EmployerPermissionGuard)
 * @RequirePermission(Permission.LOAN_APPROVE)
 * async approveAdvance(...) {}
 */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);
