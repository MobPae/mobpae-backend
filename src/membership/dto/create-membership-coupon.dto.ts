import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateMembershipCouponDto {
  @IsString()
  code: string;

  @IsNumber()
  discountAmount: number;

  @IsOptional()
  validTill?: Date;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
