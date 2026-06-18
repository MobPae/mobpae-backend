import { KycDocumentType } from '@prisma/client';

export const REQUIRED_KYC_DOCUMENTS: KycDocumentType[] = [
  'PAN',
  'AADHAR',
  'SALARY_SLIP',
];
