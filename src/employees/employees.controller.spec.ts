import { EmployeesController } from './employees.controller';

describe('EmployeesController', () => {
  it('should be defined', () => {
    const controller = new EmployeesController({} as any);

    expect(controller).toBeDefined();
  });
});
