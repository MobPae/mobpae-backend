import { IsEnum, IsString } from 'class-validator';

import { KycDocumentType } from '@prisma/client';

export class CreateKycDocumentDto {
  @IsEnum(KycDocumentType)
  documentType: KycDocumentType;

  @IsString()
  filePath: string;
}
