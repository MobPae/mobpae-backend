import { IsInt, IsNumber, IsString } from 'class-validator';

export class CreateSalaryLimitDto {
  @IsString()
  employeeId: string;

  @IsNumber()
  approvedLimit: number;

  @IsInt()
  maxRequestsPerCycle: number;

  @IsInt()
  cooldownDays: number;
}
