import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { normalizeEmailInput } from '../../common/utils/email.util';

export class LoginDto {
  @ApiProperty({
    example: 'admin@mobpae.com',
    description: 'User email address',
  })
  @Transform(({ value }) => normalizeEmailInput(value))
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'Password@123',
    description: 'User password',
  })
  @IsString()
  password: string;
}
