import { Test, TestingModule } from '@nestjs/testing';
import { KycDocumentsService } from './kyc-documents.service';

describe('KycDocumentsService', () => {
  let service: KycDocumentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KycDocumentsService],
    }).compile();

    service = module.get<KycDocumentsService>(KycDocumentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
