import { IsBoolean } from 'class-validator';

export class UpdateEmployeeActivationDto {
  @IsBoolean()
  appActivated: boolean;
}
