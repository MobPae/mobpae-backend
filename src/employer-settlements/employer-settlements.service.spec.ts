import { EmployerSettlementsService } from './employer-settlements.service';

describe('EmployerSettlementsService', () => {
  it('should be defined', () => {
    const service = new EmployerSettlementsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    expect(service).toBeDefined();
  });
});
