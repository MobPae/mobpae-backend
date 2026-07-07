import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpsertEmployerProductConfigDto {
  @ApiPropertyOptional({
    description:
      'Override the global maximumAdvancePercentage for this employer. ' +
      'Must be ≤ the product config default. Set null to use global default.',
    minimum: 1,
    maximum: 100,
    example: 40,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maximumAdvancePercentageOverride?: number | null;

  @ApiPropertyOptional({
    description:
      'Whether this employer must approve advances before admin review.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  requiresEmployerApproval?: boolean;

  @ApiPropertyOptional({
    description: 'Enable or disable this product for the employer.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
