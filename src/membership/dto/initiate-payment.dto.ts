import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitiatePaymentDto {
  @ApiProperty({
    description: 'Plan key from MembershipPlanConfig (e.g. MONTHLY, ANNUAL)',
    example: 'ANNUAL',
  })
  @IsString()
  planKey: string;

  @ApiPropertyOptional({
    description: 'Optional coupon code for a discount',
    example: 'LAUNCH50',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_-]+$/, { message: 'Coupon code must be uppercase alphanumeric' })
  @MaxLength(32)
  couponCode?: string;
}
