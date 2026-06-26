-- Link repayments to the employer settlement that contains them.
-- Nullable to preserve existing repayment records.
ALTER TABLE "repayments"
ADD COLUMN IF NOT EXISTS "settlementId" TEXT;

CREATE INDEX IF NOT EXISTS "repayments_settlementId_idx"
ON "repayments"("settlementId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'repayments_settlementId_fkey'
  ) THEN
    ALTER TABLE "repayments"
    ADD CONSTRAINT "repayments_settlementId_fkey"
    FOREIGN KEY ("settlementId")
    REFERENCES "employer_settlements"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;
