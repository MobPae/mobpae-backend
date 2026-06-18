import { BankAccountsService } from './bank-accounts.service';

describe('BankAccountsService', () => {
  it('should be defined', () => {
    const service = new BankAccountsService({} as any, {} as any, {} as any);

    expect(service).toBeDefined();
  });
});
