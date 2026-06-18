import { PayrollController } from './payroll.controller';

describe('PayrollController', () => {
  it('should be defined', () => {
    const controller = new PayrollController({} as any);

    expect(controller).toBeDefined();
  });
});
