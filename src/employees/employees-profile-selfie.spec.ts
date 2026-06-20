import { EmployeesService } from './employees.service';

const imageFile = {
  mimetype: 'image/png',
  buffer: Buffer.from('image'),
  size: 5,
};

function createService(prismaOverrides: Record<string, any> = {}) {
  const prisma = {
    employee: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    kycDocument: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...prismaOverrides,
  };
  const auditLogsService = {
    log: jest.fn().mockResolvedValue(undefined),
  };
  const filesService = {
    saveUploadedFile: jest.fn().mockResolvedValue({
      filePath: 'uploads/employee/image.png',
    }),
  };
  const notificationsService = {
    createSystemNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }),
  };

  return {
    prisma,
    auditLogsService,
    filesService,
    notificationsService,
    service: new EmployeesService(
      prisma as any,
      auditLogsService as any,
      filesService as any,
      notificationsService as any,
      {} as any,
    ),
  };
}

describe('EmployeesService profile photo and selfie verification', () => {
  it('uploads profile photo without approval or audit', async () => {
    const { prisma, filesService, auditLogsService, service } = createService();
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-1',
      profilePhotoUrl: null,
    });
    prisma.employee.update.mockResolvedValue({
      id: 'employee-1',
      profilePhotoUrl: 'uploads/employee/image.png',
    });

    await expect(
      service.uploadProfilePhoto('employee-user', imageFile),
    ).resolves.toMatchObject({
      profilePhotoUrl: 'uploads/employee/image.png',
    });

    expect(filesService.saveUploadedFile).toHaveBeenCalledWith(imageFile, {
      userId: 'employee-user',
    });
    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: {
        id: 'employee-1',
      },
      data: {
        profilePhotoUrl: 'uploads/employee/image.png',
      },
    });
    expect(auditLogsService.log).not.toHaveBeenCalled();
  });

  it('uploads selfie, resets verification, notifies admin, and audits submission', async () => {
    const { prisma, notificationsService, auditLogsService, service } =
      createService();
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-1',
      userId: 'employee-user',
      name: 'Arjun',
      selfieUrl: 'uploads/old.png',
      selfieStatus: 'VERIFIED',
      selfieVerifiedAt: new Date('2026-06-01T00:00:00.000Z'),
      selfieVerifiedBy: 'admin-old',
    });
    prisma.employee.update.mockResolvedValue({
      id: 'employee-1',
      selfieUrl: 'uploads/employee/image.png',
      selfieStatus: 'PENDING',
      selfieVerifiedAt: null,
      selfieVerifiedBy: null,
    });
    prisma.user.findMany.mockResolvedValue([{ id: 'admin-user' }]);

    await expect(
      service.uploadSelfie('employee-user', imageFile),
    ).resolves.toMatchObject({
      selfieUrl: 'uploads/employee/image.png',
      selfieStatus: 'PENDING',
    });

    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: {
        id: 'employee-1',
      },
      data: {
        selfieUrl: 'uploads/employee/image.png',
        selfieStatus: 'PENDING',
        selfieVerifiedAt: null,
        selfieVerifiedBy: null,
      },
    });
    expect(notificationsService.createSystemNotification).toHaveBeenCalledWith(
      'admin-user',
      'Selfie Submitted',
      expect.any(String),
    );
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SELFIE_SUBMITTED',
        entityType: 'EMPLOYEE',
        entityId: 'employee-1',
      }),
    );
  });

  it('verifies selfie, notifies employee, and audits approval', async () => {
    const { prisma, notificationsService, auditLogsService, service } =
      createService();
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-1',
      userId: 'employee-user',
      selfieUrl: 'uploads/selfie.png',
      selfieStatus: 'PENDING',
      selfieVerifiedAt: null,
      selfieVerifiedBy: null,
    });
    prisma.employee.update.mockResolvedValue({
      id: 'employee-1',
      selfieStatus: 'VERIFIED',
      selfieVerifiedAt: new Date('2026-06-18T00:00:00.000Z'),
      selfieVerifiedBy: 'admin-user',
    });

    await expect(
      service.verifySelfie('employee-1', 'admin-user'),
    ).resolves.toMatchObject({
      selfieStatus: 'VERIFIED',
      selfieVerifiedBy: 'admin-user',
    });

    expect(notificationsService.createSystemNotification).toHaveBeenCalledWith(
      'employee-user',
      'Selfie Verified',
      expect.any(String),
    );
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SELFIE_VERIFIED',
        entityId: 'employee-1',
      }),
    );
  });

  it('rejects selfie, notifies employee, and audits rejection remarks', async () => {
    const { prisma, notificationsService, auditLogsService, service } =
      createService();
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-1',
      userId: 'employee-user',
      selfieUrl: 'uploads/selfie.png',
      selfieStatus: 'PENDING',
      selfieVerifiedAt: null,
      selfieVerifiedBy: null,
    });
    prisma.employee.update.mockResolvedValue({
      id: 'employee-1',
      selfieStatus: 'REJECTED',
      selfieVerifiedAt: null,
      selfieVerifiedBy: 'admin-user',
    });

    await expect(
      service.rejectSelfie('employee-1', 'Face not clear', 'admin-user'),
    ).resolves.toMatchObject({
      selfieStatus: 'REJECTED',
    });

    expect(notificationsService.createSystemNotification).toHaveBeenCalledWith(
      'employee-user',
      'Selfie Rejected',
      'Face not clear',
    );
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SELFIE_REJECTED',
        entityId: 'employee-1',
        newValue: expect.objectContaining({
          remarks: 'Face not clear',
        }),
      }),
    );
  });

  it('requires verified selfie for KYC completion', async () => {
    const { prisma, service } = createService();
    prisma.employee.findUnique.mockResolvedValue({
      selfieStatus: 'PENDING',
      selfieUrl: 'uploads/selfie.png',
      selfieVerifiedAt: null,
    });
    prisma.kycDocument.findMany.mockResolvedValue([
      { documentType: 'PAN' },
      { documentType: 'AADHAR' },
      { documentType: 'SALARY_SLIP' },
    ]);

    await expect(service.getKycStatus('employee-1')).resolves.toMatchObject({
      pan: true,
      aadhar: true,
      salarySlip: true,
      selfie: false,
      selfieStatus: 'PENDING',
      kycCompleted: false,
    });
  });
});
