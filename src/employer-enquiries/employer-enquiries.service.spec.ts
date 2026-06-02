import { Test, TestingModule } from '@nestjs/testing';
import { EmployerEnquiriesService } from './employer-enquiries.service';

describe('EmployerEnquiriesService', () => {
  let service: EmployerEnquiriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmployerEnquiriesService],
    }).compile();

    service = module.get<EmployerEnquiriesService>(EmployerEnquiriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
