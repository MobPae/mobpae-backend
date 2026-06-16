import { IsString } from 'class-validator';

export class ValidateMembershipCouponDto {
  @IsString()
  couponCode: string;
}
