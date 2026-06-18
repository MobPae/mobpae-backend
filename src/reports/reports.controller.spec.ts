import { ReportsController } from './reports.controller';

describe('ReportsController', () => {
  it('delegates dashboard report to service', async () => {
    const reportsService = {
      getDashboardReport: jest.fn().mockResolvedValue({
        totalEmployers: 1,
      }),
    };
    const controller = new ReportsController(reportsService as any);

    await expect(controller.getDashboard()).resolves.toEqual({
      totalEmployers: 1,
    });
    expect(reportsService.getDashboardReport).toHaveBeenCalled();
  });
});
