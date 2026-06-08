import { IsString } from 'class-validator';

export class ApplyCouponDto {
  @IsString()
  employeeId: string;

  @IsString()
  couponCode: string;
}
