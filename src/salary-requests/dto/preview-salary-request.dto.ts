import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class PreviewSalaryRequestDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;
}
