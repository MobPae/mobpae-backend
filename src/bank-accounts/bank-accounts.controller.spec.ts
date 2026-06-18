import { BankAccountsController } from './bank-accounts.controller';

describe('BankAccountsController', () => {
  it('should be defined', () => {
    const controller = new BankAccountsController({} as any);

    expect(controller).toBeDefined();
  });
});
