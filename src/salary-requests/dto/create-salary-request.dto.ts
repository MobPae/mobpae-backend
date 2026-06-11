import { IsNumber, IsString } from 'class-validator';

export class CreateSalaryRequestDto {
  @IsNumber()
  amount: number;
}
