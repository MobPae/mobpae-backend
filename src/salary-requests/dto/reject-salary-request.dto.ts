import { IsNotEmpty, IsString } from 'class-validator';

export class RejectSalaryRequestDto {
  @IsString()
  @IsNotEmpty()
  remarks: string;
}
