import { KycDocumentsService } from './kyc-documents.service';

describe('KycDocumentsService', () => {
  it('should be defined', () => {
    const service = new KycDocumentsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    expect(service).toBeDefined();
  });
});
