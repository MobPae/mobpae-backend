import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** @deprecated Repayments are now created automatically at disbursal time. */
export class CreateRepaymentDto {
  @ApiProperty({ description: 'ID of the LoanApplication' })
  @IsString()
  loanApplicationId: string;
}
