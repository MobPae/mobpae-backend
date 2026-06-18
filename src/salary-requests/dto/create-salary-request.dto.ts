import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class CreateSalaryRequestDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;
}
