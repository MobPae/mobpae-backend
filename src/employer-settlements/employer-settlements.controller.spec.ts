import { EmployerSettlementsController } from './employer-settlements.controller';

describe('EmployerSettlementsController', () => {
  it('should be defined', () => {
    const controller = new EmployerSettlementsController({} as any);

    expect(controller).toBeDefined();
  });
});
