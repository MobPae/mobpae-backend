-- v3.2 Lending rules refactor
-- EmployerProductConfig: replace percentage override with absolute ₹ amount override
ALTER TABLE "employer_product_configs"
  RENAME COLUMN "maximumAdvancePercentageOverride" TO "maximumAdvanceAmountOverride";

ALTER TABLE "employer_product_configs"
  ALTER COLUMN "maximumAdvanceAmountOverride" TYPE INTEGER
  USING ("maximumAdvanceAmountOverride"::NUMERIC::INTEGER);

-- LoanApplication: replace percentage-based interest-free snapshot with absolute ₹ threshold
ALTER TABLE "loan_applications"
  RENAME COLUMN "snapshotInterestFreePercentage" TO "snapshotInterestFreeThreshold";

ALTER TABLE "loan_applications"
  ALTER COLUMN "snapshotInterestFreeThreshold" TYPE DECIMAL(12, 2);
