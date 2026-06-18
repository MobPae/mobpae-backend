import { PayrollService } from './payroll.service';

describe('PayrollService', () => {
  it('should be defined', () => {
    const service = new PayrollService({} as any, {} as any, {} as any);

    expect(service).toBeDefined();
  });
});
