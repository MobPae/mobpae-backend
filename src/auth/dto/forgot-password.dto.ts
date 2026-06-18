import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'admin@mobpae.com',
  })
  @IsEmail()
  email: string;
}
