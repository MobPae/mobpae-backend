import { IsOptional, IsString } from 'class-validator';

export class MarkSettlementPaidDto {
  @IsOptional()
  @IsString()
  referenceNumber?: string;
}
