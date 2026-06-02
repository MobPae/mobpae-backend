import { IsString } from 'class-validator';

export class CreateDisbursalDto {
  @IsString()
  salaryRequestId: string;
}
