import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
  it('should be defined', () => {
    const service = new EmployeesService({} as any, {} as any);

    expect(service).toBeDefined();
  });
});
