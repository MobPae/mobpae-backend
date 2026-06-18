import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({
    example: 'session-id.refresh-token-secret',
    description: 'Optional refresh token to invalidate',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
