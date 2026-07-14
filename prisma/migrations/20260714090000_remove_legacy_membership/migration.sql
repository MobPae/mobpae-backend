-- Legacy membership has been replaced by request-scoped platform fees.
-- Keep historical migration files intact, then remove the runtime schema here.

-- Any old application rows waiting for membership payment should now wait for
-- the per-request platform fee payment.
UPDATE "loan_applications"
SET "status" = 'AWAITING_PLATFORM_FEE_PAYMENT'
WHERE "status" = 'AWAITING_MEMBERSHIP_PAYMENT';

UPDATE "loan_application_history"
SET "previousStatus" = 'AWAITING_PLATFORM_FEE_PAYMENT'
WHERE "previousStatus" = 'AWAITING_MEMBERSHIP_PAYMENT';

UPDATE "loan_application_history"
SET "newStatus" = 'AWAITING_PLATFORM_FEE_PAYMENT'
WHERE "newStatus" = 'AWAITING_MEMBERSHIP_PAYMENT';

-- Existing membership orders become platform-fee orders before the enum is narrowed.
UPDATE "payment_orders"
SET "purpose" = 'PLATFORM_FEE'
WHERE "purpose" = 'MEMBERSHIP';

-- Drop legacy tables and columns. CASCADE only removes FKs from these objects.
DROP TABLE IF EXISTS "membership_coupons" CASCADE;
DROP TABLE IF EXISTS "memberships" CASCADE;
DROP TABLE IF EXISTS "membership_plan_configs" CASCADE;

ALTER TABLE "payment_orders" DROP COLUMN IF EXISTS "plan_key";
ALTER TABLE "payment_orders" DROP COLUMN IF EXISTS "coupon_code";
ALTER TABLE "payment_orders" DROP COLUMN IF EXISTS "discount_amount";

-- Remove AWAITING_MEMBERSHIP_PAYMENT from LoanApplicationStatus.
ALTER TABLE "loan_applications" ALTER COLUMN "status" DROP DEFAULT;

CREATE TYPE "LoanApplicationStatus_new" AS ENUM (
  'SUBMITTED',
  'EMPLOYER_APPROVED',
  'EMPLOYER_REJECTED',
  'AWAITING_PLATFORM_FEE_PAYMENT',
  'READY_FOR_DISBURSAL',
  'ADMIN_REJECTED',
  'DISBURSED',
  'REPAYMENT_SCHEDULED',
  'REPAID',
  'CANCELLED',
  'EXPIRED'
);

ALTER TABLE "loan_applications"
ALTER COLUMN "status" TYPE "LoanApplicationStatus_new"
USING ("status"::text::"LoanApplicationStatus_new");

ALTER TABLE "loan_application_history"
ALTER COLUMN "previousStatus" TYPE "LoanApplicationStatus_new"
USING ("previousStatus"::text::"LoanApplicationStatus_new");

ALTER TABLE "loan_application_history"
ALTER COLUMN "newStatus" TYPE "LoanApplicationStatus_new"
USING ("newStatus"::text::"LoanApplicationStatus_new");

DROP TYPE "LoanApplicationStatus";
ALTER TYPE "LoanApplicationStatus_new" RENAME TO "LoanApplicationStatus";

ALTER TABLE "loan_applications"
ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';

-- Payment orders are now platform-fee-only.
ALTER TABLE "payment_orders" ALTER COLUMN "purpose" DROP DEFAULT;

CREATE TYPE "PaymentOrderPurpose_new" AS ENUM ('PLATFORM_FEE');

ALTER TABLE "payment_orders"
ALTER COLUMN "purpose" TYPE "PaymentOrderPurpose_new"
USING ("purpose"::text::"PaymentOrderPurpose_new");

DROP TYPE "PaymentOrderPurpose";
ALTER TYPE "PaymentOrderPurpose_new" RENAME TO "PaymentOrderPurpose";

ALTER TABLE "payment_orders"
ALTER COLUMN "purpose" SET DEFAULT 'PLATFORM_FEE';

DROP TYPE IF EXISTS "MembershipStatus";
