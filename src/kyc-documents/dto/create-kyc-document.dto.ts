import { IsEnum, IsString, Matches, MaxLength } from 'class-validator';

import { KycDocumentType } from '@prisma/client';

export class CreateKycDocumentDto {
  @IsEnum(KycDocumentType)
  documentType: KycDocumentType;

  /**
   * R2 object key returned by POST /files/upload.
   * Example: employees/user-123/kyc/aadhar/1720000000-abc.pdf
   */
  @IsString()
  @MaxLength(500)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9/._-]*$/, {
    message:
      'filePath must be a valid R2 object key (alphanumeric, slashes, hyphens, dots only — no URLs)',
  })
  filePath: string;
}
