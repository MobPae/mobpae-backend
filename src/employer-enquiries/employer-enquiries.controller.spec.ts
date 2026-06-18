import { EmployerEnquiriesController } from './employer-enquiries.controller';

describe('EmployerEnquiriesController', () => {
  it('should be defined', () => {
    const controller = new EmployerEnquiriesController({} as any);

    expect(controller).toBeDefined();
  });
});
