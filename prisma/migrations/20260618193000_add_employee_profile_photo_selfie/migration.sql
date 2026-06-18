-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SelfieStatus') THEN
    CREATE TYPE "SelfieStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "employees"
ADD COLUMN IF NOT EXISTS "profilePhotoUrl" TEXT,
ADD COLUMN IF NOT EXISTS "selfieUrl" TEXT,
ADD COLUMN IF NOT EXISTS "selfieStatus" "SelfieStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS "selfieVerifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "selfieVerifiedBy" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "employees_selfieStatus_idx" ON "employees"("selfieStatus");
