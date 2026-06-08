import { IsInt, Max, Min } from 'class-validator';

export class UpdatePayrollSettingsDto {
  @IsInt()
  @Min(1)
  @Max(31)
  payrollDate: number;

  @IsInt()
  @Min(1)
  @Max(31)
  payrollCutoffDate: number;
}
