import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { EmployerPermissionGuard } from '../auth/guards/employer-permission.guard';
import { PermissionService, Permission } from '../auth/permissions';
import { EmployerSelfProductConfigsController } from './employer-product-configs.controller';

function buildContext(user: {
  role: string;
  employerRole?: string;
}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => EmployerSelfProductConfigsController.prototype.getActiveRules,
    getClass: () => EmployerSelfProductConfigsController,
  } as unknown as ExecutionContext;
}

describe('EmployerSelfProductConfigsController: getActiveRules permission', () => {
  const guard = new EmployerPermissionGuard(new Reflector(), new PermissionService());

  it('requires ORG_SETTINGS_VIEW (regression: this route previously had no @RequirePermission)', () => {
    const metadata = Reflect.getMetadata(
      'required_permission',
      EmployerSelfProductConfigsController.prototype.getActiveRules,
    );
    expect(metadata).toBe(Permission.ORG_SETTINGS_VIEW);
  });

  it('denies an employer member whose role lacks ORG_SETTINGS_VIEW (e.g. HR)', () => {
    const ctx = buildContext({ role: 'EMPLOYER', employerRole: 'HR' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows an employer member whose role has ORG_SETTINGS_VIEW (e.g. OWNER)', () => {
    const ctx = buildContext({ role: 'EMPLOYER', employerRole: 'OWNER' });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
