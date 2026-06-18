import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    example: 'session-id.refresh-token-secret',
    description: 'Refresh token issued by login or previous refresh call',
  })
  @IsString()
  refreshToken: string;
}
