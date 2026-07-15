import { ReportsController } from './reports.controller';

describe('ReportsController', () => {
  const reportsService = {
    getDashboardReport: jest.fn().mockResolvedValue({
      totalEmployers: 1,
    }),
    getRevenueReport: jest.fn().mockResolvedValue({
      totalRevenue: 925,
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates dashboard report to service', async () => {
    const controller = new ReportsController(reportsService as any);

    await expect(controller.getDashboard()).resolves.toEqual({
      totalEmployers: 1,
    });
    expect(reportsService.getDashboardReport).toHaveBeenCalled();
  });

  it('delegates revenue report to service with query params', async () => {
    const controller = new ReportsController(reportsService as any);
    const query = {
      employerId: '2f8ed1f2-d5f7-4c5d-88e7-9f8f62b74c68',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    };

    await expect(controller.getRevenue(query)).resolves.toEqual({
      totalRevenue: 925,
    });
    expect(reportsService.getRevenueReport).toHaveBeenCalledWith(query);
  });
});
