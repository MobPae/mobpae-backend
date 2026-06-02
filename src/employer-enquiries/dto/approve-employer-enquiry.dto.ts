import { IsInt, IsString, Max, Min } from 'class-validator';

export class ApproveEmployerEnquiryDto {
  @IsString()
  companyCode: string;

  @IsInt()
  @Min(1)
  @Max(31)
  payrollDate: number;

  @IsInt()
  @Min(1)
  @Max(31)
  payrollCutoffDate: number;
}
