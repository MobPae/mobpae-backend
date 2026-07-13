import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeEmailInput } from '../../common/utils/email.util';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'admin@mobpae.com',
  })
  @Transform(({ value }) => normalizeEmailInput(value))
  @IsEmail()
  email: string;
}
