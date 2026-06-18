import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RequestMembershipDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(
    /^(?!.*\.\.)(?!\/)(?!.*[<>:"|?*])(?:https:\/\/[^\s]+|[A-Za-z0-9][A-Za-z0-9/_., -]*)$/,
    {
      message:
        'paymentScreenshot must be an HTTPS URL or safe relative storage path without traversal',
    },
  )
  paymentScreenshot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  couponCode?: string;
}
