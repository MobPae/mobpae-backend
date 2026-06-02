import { IsDateString, IsString } from 'class-validator';

export class CreateRepaymentDto {
  @IsString()
  salaryRequestId: string;

  @IsDateString()
  dueDate: string;
}
