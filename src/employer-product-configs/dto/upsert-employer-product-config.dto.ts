import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class UpsertEmployerProductConfigDto {
  @ApiPropertyOptional({
    description:
      'Override the platform advance cap with an absolute ₹ amount for this employer ' +
      '(applies equally to all employees of this employer). ' +
      'Hard ceiling of salary × 50% is still enforced per employee at application time. ' +
      'Set null to remove override and fall back to platform default (min(salary×10%, ₹5000)).',
    minimum: 1000,
    example: 7000,
  })
  @IsOptional()
  @IsInt()
  @Min(1000)
  maximumAdvanceAmountOverride?: number | null;

  @ApiPropertyOptional({
    description:
      'Override the platform advance percentage for this employer (e.g. 20 = 20% of salary). ' +
      'Must be ≤ hardCeilingPercentage (typically 50). Set null to clear.',
    minimum: 1,
    maximum: 50,
    example: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
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
