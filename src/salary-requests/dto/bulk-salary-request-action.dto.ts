import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export enum BulkSalaryRequestAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class BulkSalaryRequestActionDto {
  @ApiProperty({ enum: BulkSalaryRequestAction, example: 'APPROVE' })
  @IsEnum(BulkSalaryRequestAction)
  action: BulkSalaryRequestAction;

  @ApiProperty({
    type: [String],
    example: ['request-id-1', 'request-id-2'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];

  @ApiPropertyOptional({ example: 'Outside the current payroll window.' })
  @IsOptional()
  @IsString()
  remarks?: string;
}
