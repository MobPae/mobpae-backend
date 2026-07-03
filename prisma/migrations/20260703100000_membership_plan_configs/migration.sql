-- Migration: membership_plan_configs
-- Creates the membership_plan_configs table and seeds initial plans.
-- Also migrates memberships.plan_type from the MembershipPlanType enum to plain TEXT.

-- 1. Create membership_plan_configs table
CREATE TABLE "membership_plan_configs" (
    "id"              TEXT NOT NULL,
    "plan_key"        TEXT NOT NULL,
    "plan_name"       TEXT NOT NULL,
    "amount"          DECIMAL(12,2) NOT NULL,
    "validity_days"   INTEGER NOT NULL,
    "billing_label"   TEXT NOT NULL,
    "per_month_label" TEXT,
    "is_preferred"    BOOLEAN NOT NULL DEFAULT false,
    "is_active"       BOOLEAN NOT NULL DEFAULT true,
    "sort_order"      INTEGER NOT NULL DEFAULT 0,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_plan_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "membership_plan_configs_plan_key_key" ON "membership_plan_configs"("plan_key");

-- 2. Seed the two initial plans
--    BIANNUAL first (sort_order 1 = preferred / shown at top)
INSERT INTO "membership_plan_configs"
    ("id", "plan_key", "plan_name", "amount", "validity_days", "billing_label", "per_month_label", "is_preferred", "is_active", "sort_order", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'BIANNUAL', '6 Months', 499.00, 180, 'Billed every 6 months', '= ₹83 / month', true,  true, 1, NOW(), NOW()),
    (gen_random_uuid(), 'MONTHLY',  'Monthly',  175.00,  30, 'Billed every month',     NULL,            false, true, 2, NOW(), NOW());

-- 3. Migrate memberships.plan_type from the PostgreSQL enum to TEXT
--    Must drop the DEFAULT first — it holds a typed reference to the enum.
ALTER TABLE "memberships" ALTER COLUMN "plan_type" DROP DEFAULT;
ALTER TABLE "memberships" ALTER COLUMN "plan_type" TYPE TEXT USING "plan_type"::text;
ALTER TABLE "memberships" ALTER COLUMN "plan_type" SET DEFAULT 'MONTHLY';

-- 4. Drop the now-unused enum (safe now — no column default references it)
DROP TYPE IF EXISTS "MembershipPlanType";
