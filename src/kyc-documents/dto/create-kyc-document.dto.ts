import { IsEnum, IsString, Matches, MaxLength } from 'class-validator';

import { KycDocumentType } from '@prisma/client';

export class CreateKycDocumentDto {
  @IsEnum(KycDocumentType)
  documentType: KycDocumentType;

  @IsString()
  @MaxLength(500)
  @Matches(
    /^(?!.*\.\.)(?!\/)(?!.*[<>:"|?*])(?:https:\/\/[^\s]+|[A-Za-z0-9][A-Za-z0-9/_., -]*)$/,
    {
      message:
        'filePath must be an HTTPS URL or safe relative storage path without traversal',
    },
  )
  filePath: string;
}
