-- CreateEnum
CREATE TYPE "EmployerRole" AS ENUM ('OWNER', 'ADMIN', 'HR', 'FINANCE', 'VIEWER');

-- CreateEnum
CREATE TYPE "EmployerMemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "EmployerOnboardingStage" AS ENUM ('PROSPECT', 'DISCUSSION', 'DOCS_PENDING', 'AGREEMENT_SIGNED', 'CONFIG_PENDING', 'TESTING', 'LIVE');

-- CreateEnum
CREATE TYPE "ApprovalPolicy" AS ENUM ('ANY_HR', 'FINANCE_ONLY', 'MULTI_LEVEL');

-- CreateEnum
CREATE TYPE "EmployerType" AS ENUM ('PRIVATE', 'PUBLIC', 'GOVERNMENT', 'PSU', 'STARTUP', 'NGO');

-- CreateEnum
CREATE TYPE "EmployerProductStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TRIAL', 'SUSPENDED');

-- AlterTable
ALTER TABLE "employer_product_configs" ADD COLUMN     "enrollmentStatus" "EmployerProductStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "employers" ADD COLUMN     "approvalPolicy" "ApprovalPolicy" NOT NULL DEFAULT 'ANY_HR',
ADD COLUMN     "employerType" "EmployerType",
ADD COLUMN     "onboardingStage" "EmployerOnboardingStage" NOT NULL DEFAULT 'PROSPECT';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "employer_members" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "EmployerRole" NOT NULL,
    "status" "EmployerMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "officeCode" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employer_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employer_invites" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "EmployerRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "employer_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employer_members_employerId_idx" ON "employer_members"("employerId");

-- CreateIndex
CREATE INDEX "employer_members_userId_idx" ON "employer_members"("userId");

-- CreateIndex
CREATE INDEX "employer_members_status_idx" ON "employer_members"("status");

-- CreateIndex
CREATE UNIQUE INDEX "employer_members_employerId_userId_key" ON "employer_members"("employerId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "employer_invites_tokenHash_key" ON "employer_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "employer_invites_employerId_idx" ON "employer_invites"("employerId");

-- CreateIndex
CREATE INDEX "employer_invites_email_idx" ON "employer_invites"("email");

-- CreateIndex
CREATE INDEX "employer_invites_status_idx" ON "employer_invites"("status");

-- CreateIndex
CREATE INDEX "employer_invites_expiresAt_idx" ON "employer_invites"("expiresAt");

-- AddForeignKey
ALTER TABLE "employer_members" ADD CONSTRAINT "employer_members_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_members" ADD CONSTRAINT "employer_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_invites" ADD CONSTRAINT "employer_invites_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_invites" ADD CONSTRAINT "employer_invites_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_invites" ADD CONSTRAINT "employer_invites_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
