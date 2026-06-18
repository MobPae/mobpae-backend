import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  it('should be defined', () => {
    const service = new DashboardService({} as any, {} as any);

    expect(service).toBeDefined();
  });
});
