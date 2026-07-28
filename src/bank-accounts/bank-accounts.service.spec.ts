import { BankAccountsService } from './bank-accounts.service';
import { EncryptionUtil } from '../common/utils/encryption.util';

describe('BankAccountsService', () => {
  beforeEach(() => {
    process.env.BANK_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  });

  it('should be defined', () => {
    const service = new BankAccountsService({} as any, {} as any, {} as any, {} as any);

    expect(service).toBeDefined();
  });

  describe('create', () => {
    function buildService() {
      const created: Record<string, any>[] = [];
      const prisma = {
        employee: { findUnique: jest.fn().mockResolvedValue({ id: 'employee-1' }) },
        employeeBankAccount: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn(async ({ data }: { data: Record<string, any> }) => {
            const row = { id: 'bank-1', ...data };
            created.push(row);
            return row;
          }),
        },
      };
      const audit = { log: jest.fn().mockResolvedValue(undefined) };
      const service = new BankAccountsService(
        prisma as any,
        audit as any,
        {} as any,
        {} as any,
      );
      return { service, prisma, created };
    }

    it('never persists the plaintext account number or IFSC code', async () => {
      const { service, created } = buildService();

      await service.create('user-1', {
        accountHolderName: 'Arjun Sharma',
        accountNumber: '1234567890',
        ifscCode: 'HDFC0001234',
      } as any);

      expect(created).toHaveLength(1);
      expect(created[0].accountNumber).not.toBe('1234567890');
      expect(created[0].ifscCode).not.toBe('HDFC0001234');
      expect(EncryptionUtil.decrypt(created[0].accountNumber)).toBe(
        '1234567890',
      );
      expect(EncryptionUtil.decrypt(created[0].ifscCode)).toBe('HDFC0001234');
    });

    it('returns a masked account number and the real IFSC code to the caller', async () => {
      const { service } = buildService();

      const result = await service.create('user-1', {
        accountHolderName: 'Arjun Sharma',
        accountNumber: '1234567890',
        ifscCode: 'HDFC0001234',
      } as any);

      expect(result!.accountNumber).toBe('********7890');
      expect(result!.ifscCode).toBe('HDFC0001234');
    });
  });
});
