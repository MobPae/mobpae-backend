import { ForbiddenException } from '@nestjs/common';

import { KycDocumentsService } from './kyc-documents.service';

describe('KycDocumentsService', () => {
  it('should be defined', () => {
    const service = new KycDocumentsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    expect(service).toBeDefined();
  });

  describe('create', () => {
    const employee = { id: 'employee-1', userId: 'user-employee', name: 'Arjun' };

    function buildService(canAccess: boolean) {
      const prisma = {
        employee: { findUnique: jest.fn().mockResolvedValue(employee) },
        kycDocument: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'kyc-1' }),
        },
        user: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const files = { canAccess: jest.fn().mockResolvedValue(canAccess) };
      const audit = { log: jest.fn().mockResolvedValue(undefined) };
      const notifications = {
        createSystemNotification: jest.fn().mockResolvedValue(undefined),
      };
      const service = new KycDocumentsService(
        prisma as any,
        {} as any,
        audit as any,
        notifications as any,
        files as any,
      );
      return { service, prisma, files };
    }

    it('rejects a filePath the employee does not own', async () => {
      const { service, prisma, files } = buildService(false);

      await expect(
        service.create('user-employee', {
          documentType: 'PAN' as any,
          filePath: 'employees/some-other-user/kyc/pan/document.pdf',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(files.canAccess).toHaveBeenCalledWith(
        'employees/some-other-user/kyc/pan/document.pdf',
        { userId: 'user-employee', role: 'EMPLOYEE' },
      );
      expect(prisma.kycDocument.create).not.toHaveBeenCalled();
    });

    it('creates the document when the employee owns the filePath', async () => {
      const { service, prisma } = buildService(true);

      await service.create('user-employee', {
        documentType: 'PAN' as any,
        filePath: 'employees/user-employee/kyc/pan/document.pdf',
      });

      expect(prisma.kycDocument.create).toHaveBeenCalled();
    });
  });
});
