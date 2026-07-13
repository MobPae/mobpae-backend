-- CreateEnum
CREATE TYPE "PayrollCycleType" AS ENUM ('MONTHLY', 'BIWEEKLY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "InterestCalculationMethod" AS ENUM ('SIMPLE_DAILY', 'SIMPLE_MONTHLY', 'REDUCING', 'FLAT');

-- CreateEnum
CREATE TYPE "DisbursalProvider" AS ENUM ('RAZORPAY_PAYOUT', 'CASHFREE', 'BANK_TRANSFER', 'NACH', 'INTERNAL');

-- CreateEnum
CREATE TYPE "SettlementLineItemStatus" AS ENUM ('INCLUDED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "SettlementPaymentMethod" AS ENUM ('NEFT', 'RTGS', 'IMPS', 'UPI', 'NACH', 'CHEQUE', 'INTERNAL');

-- CreateEnum
CREATE TYPE "SettlementPaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FundingPartnerType" AS ENUM ('SELF', 'NBFC', 'BANK');

-- CreateEnum
CREATE TYPE "FundingPartnerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PaymentOrderPurpose" AS ENUM ('MEMBERSHIP', 'PLATFORM_FEE');

-- CreateEnum
CREATE TYPE "LoanApplicationFeeType" AS ENUM ('PLATFORM_FEE');

-- CreateEnum
CREATE TYPE "LoanApplicationFeeStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED', 'WAIVED');

-- AlterEnum
BEGIN;
CREATE TYPE "DisbursalStatus_new" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED');
ALTER TABLE "public"."disbursals" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "disbursals" ALTER COLUMN "status" TYPE "DisbursalStatus_new" USING ("status"::text::"DisbursalStatus_new");
ALTER TYPE "DisbursalStatus" RENAME TO "DisbursalStatus_old";
ALTER TYPE "DisbursalStatus_new" RENAME TO "DisbursalStatus";
DROP TYPE "public"."DisbursalStatus_old";
ALTER TABLE "disbursals" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "EmployerSettlementStatus_new" AS ENUM ('DRAFT', 'GENERATED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');
ALTER TABLE "public"."employer_settlements" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "employer_settlements" ALTER COLUMN "status" TYPE "EmployerSettlementStatus_new" USING ("status"::text::"EmployerSettlementStatus_new");
ALTER TYPE "EmployerSettlementStatus" RENAME TO "EmployerSettlementStatus_old";
ALTER TYPE "EmployerSettlementStatus_new" RENAME TO "EmployerSettlementStatus";
DROP TYPE "public"."EmployerSettlementStatus_old";
ALTER TABLE "employer_settlements" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterEnum
ALTER TYPE "LoanApplicationStatus" ADD VALUE 'AWAITING_PLATFORM_FEE_PAYMENT';

-- DropForeignKey
ALTER TABLE "payment_orders" DROP CONSTRAINT "payment_orders_plan_key_fkey";

-- DropForeignKey
ALTER TABLE "repayments" DROP CONSTRAINT "repayments_settlementId_fkey";

-- DropIndex
DROP INDEX "employer_settlements_employerId_payrollMonth_key";

-- DropIndex
DROP INDEX "repayments_settlementId_idx";

-- AlterTable
ALTER TABLE "disbursals" DROP COLUMN "disbursedAt",
DROP COLUMN "fundingSource",
ADD COLUMN     "approvedAmount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "disbursalAccountHolderName" TEXT,
ADD COLUMN     "disbursalAccountNumber" TEXT,
ADD COLUMN     "disbursalBankName" TEXT,
ADD COLUMN     "disbursalIfscCode" TEXT,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "initiatedAt" TIMESTAMP(3),
ADD COLUMN     "initiatedBy" TEXT,
ADD COLUMN     "paymentProvider" "DisbursalProvider",
ADD COLUMN     "providerRawResponse" JSONB,
ADD COLUMN     "providerReference" TEXT,
ADD COLUMN     "providerStatus" TEXT,
ADD COLUMN     "requestedAmount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "disbursedAmount" DROP NOT NULL;

-- AlterTable
ALTER TABLE "employer_product_configs" ADD COLUMN     "maximumAdvancePercentageOverride" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "employer_settlements" DROP COLUMN "payrollMonth",
DROP COLUMN "referenceNumber",
ADD COLUMN     "cycleDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "employeeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "generatedAt" TIMESTAMP(3),
ADD COLUMN     "generatedBy" TEXT,
ADD COLUMN     "gstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "processingFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "settlementNumber" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "employers" ADD COLUMN     "cycleType" "PayrollCycleType" NOT NULL DEFAULT 'MONTHLY';

-- AlterTable
ALTER TABLE "loan_applications" ADD COLUMN     "configVersion" INTEGER,
ADD COLUMN     "fundingPartnerId" TEXT,
ADD COLUMN     "snapshotInterestCalculationMethod" "InterestCalculationMethod" NOT NULL DEFAULT 'SIMPLE_DAILY',
ADD COLUMN     "snapshotPayrollCycle" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "loan_products" ADD COLUMN     "comingSoon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "icon" TEXT;

-- AlterTable
ALTER TABLE "payment_orders" ADD COLUMN     "loan_application_fee_id" TEXT,
ADD COLUMN     "purpose" "PaymentOrderPurpose" NOT NULL DEFAULT 'MEMBERSHIP',
ALTER COLUMN "plan_key" DROP NOT NULL;

-- AlterTable
ALTER TABLE "repayments" DROP COLUMN "settlementId";

-- CreateTable
CREATE TABLE "funding_partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "FundingPartnerType" NOT NULL,
    "status" "FundingPartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "agreementDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funding_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_line_items" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "repaymentId" TEXT NOT NULL,
    "loanApplicationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "loanApplicationNumber" TEXT NOT NULL,
    "principalAmount" DECIMAL(12,2) NOT NULL,
    "interestAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "processingFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDeductionAmount" DECIMAL(12,2) NOT NULL,
    "status" "SettlementLineItemStatus" NOT NULL DEFAULT 'INCLUDED',
    "remarks" TEXT,
    "snapshotCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_payments" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "SettlementPaymentMethod" NOT NULL,
    "paymentReference" TEXT,
    "bankReference" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "receivedDate" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "status" "SettlementPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_application_fees" (
    "id" TEXT NOT NULL,
    "loan_application_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "fee_type" "LoanApplicationFeeType" NOT NULL DEFAULT 'PLATFORM_FEE',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "LoanApplicationFeeStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "provider" "PaymentProvider" DEFAULT 'RAZORPAY',
    "provider_order_id" TEXT,
    "provider_payment_id" TEXT,
    "provider_signature" TEXT,
    "paid_at" TIMESTAMP(3),
    "waived_at" TIMESTAMP(3),
    "waived_by" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_application_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "funding_partners_code_key" ON "funding_partners"("code");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_line_items_repaymentId_key" ON "settlement_line_items"("repaymentId");

-- CreateIndex
CREATE INDEX "settlement_line_items_settlementId_idx" ON "settlement_line_items"("settlementId");

-- CreateIndex
CREATE INDEX "settlement_payments_settlementId_idx" ON "settlement_payments"("settlementId");

-- CreateIndex
CREATE UNIQUE INDEX "loan_application_fees_loan_application_id_key" ON "loan_application_fees"("loan_application_id");

-- CreateIndex
CREATE INDEX "loan_application_fees_employee_id_status_idx" ON "loan_application_fees"("employee_id", "status");

-- CreateIndex
CREATE INDEX "loan_application_fees_employer_id_status_idx" ON "loan_application_fees"("employer_id", "status");

-- CreateIndex
CREATE INDEX "loan_application_fees_status_created_at_idx" ON "loan_application_fees"("status", "created_at");

-- CreateIndex
CREATE INDEX "loan_application_fees_provider_order_id_idx" ON "loan_application_fees"("provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "loan_application_fees_loan_application_id_fee_type_key" ON "loan_application_fees"("loan_application_id", "fee_type");

-- CreateIndex
CREATE INDEX "disbursals_status_idx" ON "disbursals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "employer_settlements_settlementNumber_key" ON "employer_settlements"("settlementNumber");

-- CreateIndex
CREATE UNIQUE INDEX "employer_settlements_employerId_cycleDate_key" ON "employer_settlements"("employerId", "cycleDate");

-- CreateIndex
CREATE INDEX "payment_orders_purpose_status_idx" ON "payment_orders"("purpose", "status");

-- CreateIndex
CREATE INDEX "payment_orders_loan_application_fee_id_idx" ON "payment_orders"("loan_application_fee_id");

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_fundingPartnerId_fkey" FOREIGN KEY ("fundingPartnerId") REFERENCES "funding_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_line_items" ADD CONSTRAINT "settlement_line_items_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "employer_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_line_items" ADD CONSTRAINT "settlement_line_items_repaymentId_fkey" FOREIGN KEY ("repaymentId") REFERENCES "repayments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_payments" ADD CONSTRAINT "settlement_payments_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "employer_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_plan_key_fkey" FOREIGN KEY ("plan_key") REFERENCES "membership_plan_configs"("plan_key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_loan_application_fee_id_fkey" FOREIGN KEY ("loan_application_fee_id") REFERENCES "loan_application_fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_application_fees" ADD CONSTRAINT "loan_application_fees_loan_application_id_fkey" FOREIGN KEY ("loan_application_id") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_application_fees" ADD CONSTRAINT "loan_application_fees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_application_fees" ADD CONSTRAINT "loan_application_fees_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

