import { IsOptional, IsString } from 'class-validator';

export class RequestMembershipDto {
  @IsString()
  paymentReference: string;

  @IsString()
  paymentScreenshot: string;

  @IsOptional()
  @IsString()
  couponCode?: string;
}
