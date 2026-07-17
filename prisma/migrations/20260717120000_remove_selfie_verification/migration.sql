-- Selfie identity verification has been removed from the product. The admin
-- panel never surfaced a review UI for it, the employee mobile app never
-- implemented capture/upload, and the loan-eligibility gate (requiresActiveSelfie
-- in LoanProductConfig.eligibilityRules) was never read by any service. This
-- migration removes the now-dead columns, index, and enum from Employee.
--
-- NOT RUN AUTOMATICALLY — review before applying (prisma migrate deploy).
-- If any employees have real selfieUrl data you want to archive first, export
-- "employees"."selfieUrl" before running this.

DROP INDEX IF EXISTS "employees_selfieStatus_idx";

ALTER TABLE "employees" DROP COLUMN IF EXISTS "selfieUrl";
ALTER TABLE "employees" DROP COLUMN IF EXISTS "selfieStatus";
ALTER TABLE "employees" DROP COLUMN IF EXISTS "selfieVerifiedAt";
ALTER TABLE "employees" DROP COLUMN IF EXISTS "selfieVerifiedBy";

DROP TYPE IF EXISTS "SelfieStatus";
