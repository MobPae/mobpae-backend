import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateDisbursalDto {
  @ApiProperty({ description: 'ID of the LoanApplication to disburse' })
  @IsString()
  loanApplicationId: string;
}
