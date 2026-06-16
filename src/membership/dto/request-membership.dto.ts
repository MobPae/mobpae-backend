import { IsOptional, IsString } from 'class-validator';

export class RequestMembershipDto {
  @IsOptional()
  @IsString()
  paymentReference?: string;

  @IsOptional()
  @IsString()
  paymentScreenshot?: string;

  @IsOptional()
  @IsString()
  couponCode?: string;
}
