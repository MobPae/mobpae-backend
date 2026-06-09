import { Test, TestingModule } from '@nestjs/testing';
import { EmployerSettlementsService } from './employer-settlements.service';

describe('EmployerSettlementsService', () => {
  let service: EmployerSettlementsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmployerSettlementsService],
    }).compile();

    service = module.get<EmployerSettlementsService>(EmployerSettlementsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
