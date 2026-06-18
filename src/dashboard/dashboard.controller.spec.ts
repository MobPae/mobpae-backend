import { DashboardController } from './dashboard.controller';

describe('DashboardController', () => {
  it('should be defined', () => {
    const controller = new DashboardController({} as any);

    expect(controller).toBeDefined();
  });
});
