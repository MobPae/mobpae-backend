-- CreateEnum
CREATE TYPE "MembershipPlanType" AS ENUM ('MONTHLY', 'BIANNUAL');

-- AlterTable: add plan_type column with default MONTHLY for existing rows
ALTER TABLE "memberships" ADD COLUMN "plan_type" "MembershipPlanType" NOT NULL DEFAULT 'MONTHLY';
