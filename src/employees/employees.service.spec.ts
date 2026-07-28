import { ConflictException } from '@nestjs/common';

import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
  it('should be defined', () => {
    const service = new EmployeesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    expect(service).toBeDefined();
  });

  describe('update', () => {
    const employer = { id: 'employer-1' };
    const employee = {
      id: 'employee-1',
      employerId: 'employer-1',
      userId: 'user-1',
      email: 'old@example.com',
    };

    function buildService(overrides: { existingUser?: any } = {}) {
      const prisma = {
        employer: { findUnique: jest.fn().mockResolvedValue(employer) },
        employee: {
          findFirst: jest.fn().mockResolvedValue(employee),
          update: jest.fn(async ({ data }: { data: Record<string, any> }) => ({
            ...employee,
            ...data,
          })),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue(overrides.existingUser ?? null),
          update: jest.fn().mockResolvedValue(undefined),
        },
        $transaction: jest.fn(async (fn: any) =>
          fn({ employee: prisma.employee, user: prisma.user }),
        ),
      };
      const audit = { log: jest.fn().mockResolvedValue(undefined) };
      const service = new EmployeesService(
        prisma as any,
        audit as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      return { service, prisma };
    }

    it('rejects an email already used by a different user', async () => {
      const { service, prisma } = buildService({
        existingUser: { id: 'someone-else' },
      });

      await expect(
        service.update(
          'employee-1',
          { email: 'taken@example.com' } as any,
          'employer-1',
          'admin-1',
        ),
      ).rejects.toThrow(ConflictException);

      expect(prisma.employee.update).not.toHaveBeenCalled();
    });

    it('keeps User.email in sync when Employee.email changes (regression: previously desynced)', async () => {
      const { service, prisma } = buildService();

      await service.update(
        'employee-1',
        { email: 'new@example.com' } as any,
        'employer-1',
        'admin-1',
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { email: 'new@example.com' },
      });
      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'new@example.com' }),
        }),
      );
    });

    it('does not touch User.email when email is not part of the update', async () => {
      const { service, prisma } = buildService();

      await service.update(
        'employee-1',
        { name: 'New Name' } as any,
        'employer-1',
        'admin-1',
      );

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
