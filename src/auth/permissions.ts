/**
 * PermissionService — single source of truth for role-based access.
 *
 * Business logic NEVER checks `member.role === 'HR'` directly.
 * Always use: PermissionService.hasPermission(member, Permission.LOAN_APPROVE)
 *
 * Swapping the backing store from the constant below to a database table
 * requires changing only this file — zero changes to service/controller code.
 */

import { Injectable } from '@nestjs/common';
import { EmployerRole } from '@prisma/client';

// ─── Permission tokens ───────────────────────────────────────────────────────

export enum Permission {
  // Employee management
  EMPLOYEE_VIEW = 'EMPLOYEE_VIEW',
  EMPLOYEE_MANAGE = 'EMPLOYEE_MANAGE', // add, edit, deactivate

  // Loan / advance approvals
  LOAN_VIEW = 'LOAN_VIEW',
  LOAN_APPROVE = 'LOAN_APPROVE',

  // Settlements & finance
  SETTLEMENT_VIEW = 'SETTLEMENT_VIEW',
  SETTLEMENT_MANAGE = 'SETTLEMENT_MANAGE',

  // Reports
  REPORT_VIEW = 'REPORT_VIEW',

  // Team / portal user management
  MEMBER_VIEW = 'MEMBER_VIEW',
  MEMBER_INVITE = 'MEMBER_INVITE', // send invite
  MEMBER_MANAGE = 'MEMBER_MANAGE', // change role, suspend, remove

  // Org-level settings (approval policy, product config)
  ORG_SETTINGS_VIEW = 'ORG_SETTINGS_VIEW',
  ORG_SETTINGS_MANAGE = 'ORG_SETTINGS_MANAGE',
}

// ─── Role → Permission map ───────────────────────────────────────────────────
// Highest role listed first. Each role is additive — there is no inheritance
// here intentionally, so the list is explicit and auditable.

const RolePermissions: Record<EmployerRole, Permission[]> = {
  [EmployerRole.OWNER]: [
    Permission.EMPLOYEE_VIEW,
    Permission.EMPLOYEE_MANAGE,
    Permission.LOAN_VIEW,
    Permission.LOAN_APPROVE,
    Permission.SETTLEMENT_VIEW,
    Permission.SETTLEMENT_MANAGE,
    Permission.REPORT_VIEW,
    Permission.MEMBER_VIEW,
    Permission.MEMBER_INVITE,
    Permission.MEMBER_MANAGE,
    Permission.ORG_SETTINGS_VIEW,
    Permission.ORG_SETTINGS_MANAGE,
  ],

  [EmployerRole.ADMIN]: [
    Permission.EMPLOYEE_VIEW,
    Permission.EMPLOYEE_MANAGE,
    Permission.LOAN_VIEW,
    Permission.LOAN_APPROVE,
    Permission.SETTLEMENT_VIEW,
    Permission.SETTLEMENT_MANAGE,
    Permission.REPORT_VIEW,
    Permission.MEMBER_VIEW,
    Permission.MEMBER_INVITE,
    // MEMBER_MANAGE intentionally excluded — cannot change OWNER
    Permission.ORG_SETTINGS_VIEW,
    Permission.ORG_SETTINGS_MANAGE,
  ],

  [EmployerRole.HR]: [
    Permission.EMPLOYEE_VIEW,
    Permission.EMPLOYEE_MANAGE,
    Permission.LOAN_VIEW,
    Permission.LOAN_APPROVE,
    Permission.REPORT_VIEW,
    Permission.MEMBER_VIEW,
  ],

  [EmployerRole.FINANCE]: [
    Permission.EMPLOYEE_VIEW,
    Permission.LOAN_VIEW,
    Permission.SETTLEMENT_VIEW,
    Permission.SETTLEMENT_MANAGE,
    Permission.REPORT_VIEW,
    Permission.MEMBER_VIEW,
  ],

  [EmployerRole.VIEWER]: [
    Permission.EMPLOYEE_VIEW,
    Permission.LOAN_VIEW,
    Permission.SETTLEMENT_VIEW,
    Permission.REPORT_VIEW,
    Permission.MEMBER_VIEW,
  ],
};

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class PermissionService {
  /**
   * Returns true if the member's role includes the requested permission.
   *
   * @param member  Any object with a `role: EmployerRole` field
   * @param permission  The permission to check
   */
  hasPermission(
    member: { role: EmployerRole },
    permission: Permission,
  ): boolean {
    return RolePermissions[member.role]?.includes(permission) ?? false;
  }

  /**
   * Returns all permissions for a given role. Useful for building
   * a "what can I do?" payload in the employer portal JWT or profile endpoint.
   */
  getPermissions(role: EmployerRole): Permission[] {
    return RolePermissions[role] ?? [];
  }

  /**
   * Convenience: returns true if a given role outranks another.
   * OWNER > ADMIN > HR = FINANCE > VIEWER
   * Used to enforce the "cannot invite/promote to a role equal or above your own" rule.
   */
  canManageRole(actorRole: EmployerRole, targetRole: EmployerRole): boolean {
    return roleRank(actorRole) > roleRank(targetRole);
  }
}

// ─── Role rank (internal) ────────────────────────────────────────────────────

function roleRank(role: EmployerRole): number {
  switch (role) {
    case EmployerRole.OWNER:
      return 5;
    case EmployerRole.ADMIN:
      return 4;
    case EmployerRole.HR:
      return 3;
    case EmployerRole.FINANCE:
      return 3;
    case EmployerRole.VIEWER:
      return 1;
  }
}
