import { IsArray, IsBoolean, IsString } from 'class-validator';

export class BulkEmployeeActivationDto {
  @IsArray()
  @IsString({ each: true })
  employeeIds: string[];

  @IsBoolean()
  appActivated: boolean;
}
