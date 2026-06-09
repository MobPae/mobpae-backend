-- CreateEnum
CREATE TYPE "EmployerSettlementStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "EmployerRiskStatus" AS ENUM ('GOOD', 'WARNING', 'BLOCKED');

-- AlterTable
ALTER TABLE "employers" ADD COLUMN     "riskStatus" "EmployerRiskStatus" NOT NULL DEFAULT 'GOOD';

-- CreateTable
CREATE TABLE "employer_settlements" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "payrollMonth" TEXT NOT NULL,
    "principalAmount" DECIMAL(12,2) NOT NULL,
    "lateFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "outstandingAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "status" "EmployerSettlementStatus" NOT NULL DEFAULT 'PENDING',
    "referenceNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employer_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employer_settlements_employerId_idx" ON "employer_settlements"("employerId");

-- CreateIndex
CREATE INDEX "employer_settlements_status_idx" ON "employer_settlements"("status");

-- CreateIndex
CREATE UNIQUE INDEX "employer_settlements_employerId_payrollMonth_key" ON "employer_settlements"("employerId", "payrollMonth");

-- AddForeignKey
ALTER TABLE "employer_settlements" ADD CONSTRAINT "employer_settlements_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
