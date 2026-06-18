import { KycDocumentsController } from './kyc-documents.controller';

describe('KycDocumentsController', () => {
  it('should be defined', () => {
    const controller = new KycDocumentsController({} as any);

    expect(controller).toBeDefined();
  });
});
