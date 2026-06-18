ALTER TABLE "memberships"
ADD COLUMN IF NOT EXISTS "paymentReference" TEXT,
ADD COLUMN IF NOT EXISTS "paymentScreenshot" TEXT,
ADD COLUMN IF NOT EXISTS "verifiedBy" TEXT,
ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "remarks" TEXT;

ALTER TABLE "memberships"
ALTER COLUMN "status" SET DEFAULT 'PENDING';

CREATE TABLE IF NOT EXISTS "membership_coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validTill" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_coupons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "membership_coupons_code_key"
ON "membership_coupons"("code");

ALTER TABLE "employer_settlements"
ADD COLUMN IF NOT EXISTS "interestAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
