import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class PreviewLoanApplicationDto {
  @ApiProperty({
    example: 3500,
    minimum: 1000,
    description: 'Requested preview amount in INR (whole rupees)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  amount: number;
}
