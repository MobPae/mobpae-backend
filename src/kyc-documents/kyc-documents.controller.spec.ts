import { Test, TestingModule } from '@nestjs/testing';
import { KycDocumentsController } from './kyc-documents.controller';

describe('KycDocumentsController', () => {
  let controller: KycDocumentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KycDocumentsController],
    }).compile();

    controller = module.get<KycDocumentsController>(KycDocumentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
