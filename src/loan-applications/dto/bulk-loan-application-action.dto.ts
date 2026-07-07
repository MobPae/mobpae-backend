import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class BulkLoanApplicationActionDto {
  @ApiProperty({ type: [String], example: ['id-1', 'id-2'] })
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsIn(['APPROVE', 'REJECT'])
  action: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ example: 'Batch approved for payroll cycle' })
  @IsOptional()
  @IsString()
  reason?: string;
}
