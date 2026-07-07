-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EMPLOYER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "EmployerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SelfieStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LoanProductType" AS ENUM ('SA', 'PL', 'HL', 'VL', 'EL', 'CL');

-- CreateEnum
CREATE TYPE "LoanPurposeCategory" AS ENUM ('MEDICAL', 'EDUCATION', 'HOUSE_RENT', 'UTILITY_BILLS', 'EMERGENCY', 'FAMILY_EXPENSE', 'TRAVEL', 'SHOPPING', 'OTHER');

-- CreateEnum
CREATE TYPE "LoanApplicationStatus" AS ENUM ('SUBMITTED', 'EMPLOYER_APPROVED', 'EMPLOYER_REJECTED', 'AWAITING_MEMBERSHIP_PAYMENT', 'READY_FOR_DISBURSAL', 'ADMIN_REJECTED', 'DISBURSED', 'REPAYMENT_SCHEDULED', 'REPAID', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DisbursalStatus" AS ENUM ('PENDING', 'DISBURSED', 'FAILED');

-- CreateEnum
CREATE TYPE "RepaymentStatus" AS ENUM ('SCHEDULED', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "EmployerSettlementStatus" AS ENUM ('NO_DUES', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "EmployerRiskStatus" AS ENUM ('GOOD', 'WARNING', 'BLOCKED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmployerEnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'REJECTED', 'ONBOARDED');

-- CreateEnum
CREATE TYPE "KycDocumentType" AS ENUM ('AADHAR', 'PAN', 'SALARY_SLIP', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SYSTEM', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "AppInfoType" AS ENUM ('ABOUT', 'PRIVACY_POLICY', 'TERMS_CONDITIONS', 'HOW_IT_WORKS', 'FAQ', 'CONTACT', 'WHATS_NEW');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "passwordChanged" BOOLEAN NOT NULL DEFAULT false,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employers" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyCode" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "payrollDate" INTEGER NOT NULL,
    "payrollCutoffDate" INTEGER NOT NULL,
    "status" "EmployerStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "riskStatus" "EmployerRiskStatus" NOT NULL DEFAULT 'GOOD',

    CONSTRAINT "employers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "employerId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "salaryInHand" DECIMAL(12,2) NOT NULL,
    "profilePhotoUrl" TEXT,
    "selfieUrl" TEXT,
    "selfieStatus" "SelfieStatus" NOT NULL DEFAULT 'PENDING',
    "selfieVerifiedAt" TIMESTAMP(3),
    "selfieVerifiedBy" TEXT,
    "joiningDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "appActivated" BOOLEAN NOT NULL DEFAULT false,
    "employmentStatus" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_bank_accounts" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifscCode" TEXT NOT NULL,
    "bankName" TEXT,
    "upiId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_products" (
    "id" TEXT NOT NULL,
    "productType" "LoanProductType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "launchDate" TIMESTAMP(3),
    "retirementDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_product_configs" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "versionName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "previousVersionId" TEXT,
    "eligibilityRules" JSONB NOT NULL,
    "pricingRules" JSONB NOT NULL,
    "operationalRules" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_product_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employer_product_configs" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "maximumAdvancePercentageOverride" DECIMAL(5,2),
    "requiresEmployerApproval" BOOLEAN NOT NULL DEFAULT true,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employer_product_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_limits" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "maximumEligibleAmount" DECIMAL(12,2) NOT NULL,
    "maxRequestsPerCycle" INTEGER NOT NULL DEFAULT 1,
    "cooldownDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_applications" (
    "id" TEXT NOT NULL,
    "applicationNumber" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "requestedAmount" DECIMAL(12,2) NOT NULL,
    "employerApprovedAmount" DECIMAL(12,2),
    "adminApprovedAmount" DECIMAL(12,2),
    "purposeCategory" "LoanPurposeCategory" NOT NULL,
    "purposeNote" TEXT,
    "status" "LoanApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshotAnnualInterestRate" DECIMAL(5,2) NOT NULL,
    "snapshotInterestFreePercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "snapshotProcessingFeeRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "snapshotGstRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "snapshotMaxAdvancePercentage" DECIMAL(5,2) NOT NULL,
    "snapshotSalaryInHand" DECIMAL(12,2) NOT NULL,
    "snapshotInterestDays" INTEGER NOT NULL,
    "snapshotRecoveryDate" TIMESTAMP(3) NOT NULL,
    "employerApprovedBy" TEXT,
    "employerApprovedAt" TIMESTAMP(3),
    "adminApprovedBy" TEXT,
    "adminApprovedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_application_history" (
    "id" TEXT NOT NULL,
    "loanApplicationId" TEXT NOT NULL,
    "previousStatus" "LoanApplicationStatus",
    "newStatus" "LoanApplicationStatus" NOT NULL,
    "changedBy" TEXT,
    "actorRole" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_application_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursals" (
    "id" TEXT NOT NULL,
    "loanApplicationId" TEXT NOT NULL,
    "disbursedAmount" DECIMAL(12,2) NOT NULL,
    "fundingSource" TEXT,
    "disbursedBy" TEXT,
    "disbursedAt" TIMESTAMP(3),
    "status" "DisbursalStatus" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disbursals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repayments" (
    "id" TEXT NOT NULL,
    "loanApplicationId" TEXT NOT NULL,
    "settlementId" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "status" "RepaymentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "remarks" TEXT,
    "principalAmount" DECIMAL(12,2) NOT NULL,
    "interestFreeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "interestBearingAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "interestAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "processingFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "interestRate" DECIMAL(5,2) NOT NULL DEFAULT 36,
    "interestDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repayments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "plan_key" TEXT NOT NULL,
    "plan_type" TEXT NOT NULL DEFAULT 'MONTHLY',
    "planName" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "paymentReference" TEXT,
    "paymentScreenshot" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "couponCode" TEXT,
    "discountAmount" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_plan_configs" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "plan_key" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "validity_days" INTEGER NOT NULL,
    "billing_label" TEXT NOT NULL,
    "per_month_label" TEXT,
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_plan_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_coupons" (
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

-- CreateTable
CREATE TABLE "employer_settlements" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "payrollMonth" TEXT NOT NULL,
    "principalAmount" DECIMAL(12,2) NOT NULL,
    "interestAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lateFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "outstandingAmount" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "status" "EmployerSettlementStatus" NOT NULL DEFAULT 'PENDING',
    "referenceNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employer_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employer_enquiries" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "employeeCount" INTEGER,
    "status" "EmployerEnquiryStatus" NOT NULL DEFAULT 'NEW',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "employerId" TEXT,

    CONSTRAINT "employer_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "documentType" "KycDocumentType" NOT NULL,
    "filePath" TEXT NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_information" (
    "id" TEXT NOT NULL,
    "type" "AppInfoType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_information_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokenSelector" TEXT,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employers_companyCode_key" ON "employers"("companyCode");

-- CreateIndex
CREATE UNIQUE INDEX "employers_email_key" ON "employers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employers_userId_key" ON "employers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE INDEX "employees_employerId_idx" ON "employees"("employerId");

-- CreateIndex
CREATE INDEX "employees_selfieStatus_idx" ON "employees"("selfieStatus");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employerId_employeeCode_key" ON "employees"("employerId", "employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "employee_bank_accounts_employeeId_key" ON "employee_bank_accounts"("employeeId");

-- CreateIndex
CREATE INDEX "employee_bank_accounts_verified_idx" ON "employee_bank_accounts"("verified");

-- CreateIndex
CREATE UNIQUE INDEX "loan_products_productType_key" ON "loan_products"("productType");

-- CreateIndex
CREATE UNIQUE INDEX "loan_product_configs_previousVersionId_key" ON "loan_product_configs"("previousVersionId");

-- CreateIndex
CREATE INDEX "loan_product_configs_productId_isActive_idx" ON "loan_product_configs"("productId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "loan_product_configs_productId_versionNumber_key" ON "loan_product_configs"("productId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "employer_product_configs_employerId_productId_key" ON "employer_product_configs"("employerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "loan_limits_employeeId_key" ON "loan_limits"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "loan_applications_applicationNumber_key" ON "loan_applications"("applicationNumber");

-- CreateIndex
CREATE INDEX "loan_applications_employeeId_idx" ON "loan_applications"("employeeId");

-- CreateIndex
CREATE INDEX "loan_applications_employerId_idx" ON "loan_applications"("employerId");

-- CreateIndex
CREATE INDEX "loan_applications_status_idx" ON "loan_applications"("status");

-- CreateIndex
CREATE INDEX "loan_applications_productId_idx" ON "loan_applications"("productId");

-- CreateIndex
CREATE INDEX "loan_applications_submittedAt_idx" ON "loan_applications"("submittedAt");

-- CreateIndex
CREATE INDEX "loan_application_history_loanApplicationId_createdAt_idx" ON "loan_application_history"("loanApplicationId", "createdAt");

-- CreateIndex
CREATE INDEX "loan_application_history_newStatus_idx" ON "loan_application_history"("newStatus");

-- CreateIndex
CREATE UNIQUE INDEX "disbursals_loanApplicationId_key" ON "disbursals"("loanApplicationId");

-- CreateIndex
CREATE UNIQUE INDEX "repayments_loanApplicationId_key" ON "repayments"("loanApplicationId");

-- CreateIndex
CREATE INDEX "repayments_settlementId_idx" ON "repayments"("settlementId");

-- CreateIndex
CREATE INDEX "repayments_status_idx" ON "repayments"("status");

-- CreateIndex
CREATE INDEX "repayments_dueDate_idx" ON "repayments"("dueDate");

-- CreateIndex
CREATE INDEX "repayments_status_dueDate_idx" ON "repayments"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_employeeId_key" ON "memberships"("employeeId");

-- CreateIndex
CREATE INDEX "memberships_status_idx" ON "memberships"("status");

-- CreateIndex
CREATE INDEX "memberships_endDate_idx" ON "memberships"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "membership_plan_configs_plan_key_key" ON "membership_plan_configs"("plan_key");

-- CreateIndex
CREATE UNIQUE INDEX "membership_coupons_code_key" ON "membership_coupons"("code");

-- CreateIndex
CREATE INDEX "employer_settlements_employerId_idx" ON "employer_settlements"("employerId");

-- CreateIndex
CREATE INDEX "employer_settlements_status_idx" ON "employer_settlements"("status");

-- CreateIndex
CREATE UNIQUE INDEX "employer_settlements_employerId_payrollMonth_key" ON "employer_settlements"("employerId", "payrollMonth");

-- CreateIndex
CREATE UNIQUE INDEX "employer_enquiries_employerId_key" ON "employer_enquiries"("employerId");

-- CreateIndex
CREATE INDEX "employer_enquiries_status_idx" ON "employer_enquiries"("status");

-- CreateIndex
CREATE INDEX "employer_enquiries_createdAt_idx" ON "employer_enquiries"("createdAt");

-- CreateIndex
CREATE INDEX "kyc_documents_status_idx" ON "kyc_documents"("status");

-- CreateIndex
CREATE INDEX "kyc_documents_status_employeeId_idx" ON "kyc_documents"("status", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_documents_employeeId_documentType_key" ON "kyc_documents"("employeeId", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "app_information_type_isActive_idx" ON "app_information"("type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "app_information_type_key" ON "app_information"("type");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs"("entityType");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "user_sessions_userId_idx" ON "user_sessions"("userId");

-- CreateIndex
CREATE INDEX "user_sessions_isActive_idx" ON "user_sessions"("isActive");

-- CreateIndex
CREATE INDEX "user_sessions_isActive_updatedAt_idx" ON "user_sessions"("isActive", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenSelector_key" ON "password_reset_tokens"("tokenSelector");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "employers" ADD CONSTRAINT "employers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_bank_accounts" ADD CONSTRAINT "employee_bank_accounts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_product_configs" ADD CONSTRAINT "loan_product_configs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "loan_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_product_configs" ADD CONSTRAINT "loan_product_configs_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "loan_product_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_product_configs" ADD CONSTRAINT "employer_product_configs_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_product_configs" ADD CONSTRAINT "employer_product_configs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "loan_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_limits" ADD CONSTRAINT "loan_limits_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_productId_fkey" FOREIGN KEY ("productId") REFERENCES "loan_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_configId_fkey" FOREIGN KEY ("configId") REFERENCES "loan_product_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_application_history" ADD CONSTRAINT "loan_application_history_loanApplicationId_fkey" FOREIGN KEY ("loanApplicationId") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursals" ADD CONSTRAINT "disbursals_loanApplicationId_fkey" FOREIGN KEY ("loanApplicationId") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayments" ADD CONSTRAINT "repayments_loanApplicationId_fkey" FOREIGN KEY ("loanApplicationId") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayments" ADD CONSTRAINT "repayments_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "employer_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_plan_configs" ADD CONSTRAINT "membership_plan_configs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "loan_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_settlements" ADD CONSTRAINT "employer_settlements_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_enquiries" ADD CONSTRAINT "employer_enquiries_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
