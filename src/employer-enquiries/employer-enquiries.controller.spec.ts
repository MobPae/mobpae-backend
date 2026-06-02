import { Test, TestingModule } from '@nestjs/testing';
import { EmployerEnquiriesController } from './employer-enquiries.controller';

describe('EmployerEnquiriesController', () => {
  let controller: EmployerEnquiriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmployerEnquiriesController],
    }).compile();

    controller = module.get<EmployerEnquiriesController>(EmployerEnquiriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
