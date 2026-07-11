import { IsOptional, IsString } from 'class-validator';

export class MarkSettlementPaidDto {
  /**
   * Optional bank reference / UTR number for reconciliation.
   * Stored as a note on the settlement.
   */
  @IsOptional()
  @IsString()
  referenceNumber?: string;
}
