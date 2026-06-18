import { EmployerEnquiriesService } from './employer-enquiries.service';

describe('EmployerEnquiriesService', () => {
  it('should be defined', () => {
    const service = new EmployerEnquiriesService(
      {} as any,
      {} as any,
      {} as any,
    );

    expect(service).toBeDefined();
  });
});
