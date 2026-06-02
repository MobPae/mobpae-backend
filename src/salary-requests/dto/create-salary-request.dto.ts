import { IsNumber, IsString } from 'class-validator';

export class CreateSalaryRequestDto {
  @IsString()
  employeeId: string;

  @IsNumber()
  amount: number;
}
