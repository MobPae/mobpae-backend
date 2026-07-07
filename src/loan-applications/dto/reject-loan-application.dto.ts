import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectLoanApplicationDto {
  @ApiProperty({ example: 'Insufficient salary documentation' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
