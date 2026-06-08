import { IsOptional, IsString } from 'class-validator';

export class ActivateMembershipDto {
  @IsString()
  employeeId: string;

  @IsOptional()
  @IsString()
  couponCode?: string;
}
