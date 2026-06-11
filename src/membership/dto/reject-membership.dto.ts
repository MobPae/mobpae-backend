import { IsString } from 'class-validator';

export class RejectMembershipDto {
  @IsString()
  remarks: string;
}
