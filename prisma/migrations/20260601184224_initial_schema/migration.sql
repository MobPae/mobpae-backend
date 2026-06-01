-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EMPLOYER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "EmployerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ACTIVE');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SalaryRequestStatus" AS ENUM ('SUBMITTED', 'EMPLOYER_APPROVED', 'EMPLOYER_REJECTED', 'READY_FOR_DISBURSAL', 'DISBURSED', 'REPAYMENT_SCHEDULED', 'REPAID');

-- CreateEnum
CREATE TYPE "DisbursalStatus" AS ENUM ('PENDING', 'DISBURSED', 'FAILED');

-- CreateEnum
CREATE TYPE "RepaymentStatus" AS ENUM ('SCHEDULED', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmployerEnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KycDocumentType" AS ENUM ('AADHAR', 'PAN', 'SALARY_SLIP', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SYSTEM', 'EMAIL', 'SMS');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
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
    "joiningDate" TIMESTAMP(3),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_limits" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "approvedLimit" DECIMAL(12,2) NOT NULL,
    "maxRequestsPerCycle" INTEGER NOT NULL DEFAULT 1,
    "cooldownDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "approvedAmount" DECIMAL(12,2),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reason" TEXT,
    "remarks" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repaymentDate" TIMESTAMP(3),
    "status" "SalaryRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursals" (
    "id" TEXT NOT NULL,
    "salaryRequestId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
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
    "salaryRequestId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "status" "RepaymentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repayments_pkey" PRIMARY KEY ("id")
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

    CONSTRAINT "employer_enquiries_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employers_companyCode_key" ON "employers"("companyCode");

-- CreateIndex
CREATE UNIQUE INDEX "employers_email_key" ON "employers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE INDEX "employees_employerId_idx" ON "employees"("employerId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employerId_employeeCode_key" ON "employees"("employerId", "employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "salary_limits_employeeId_key" ON "salary_limits"("employeeId");

-- CreateIndex
CREATE INDEX "salary_requests_employeeId_idx" ON "salary_requests"("employeeId");

-- CreateIndex
CREATE INDEX "salary_requests_employerId_idx" ON "salary_requests"("employerId");

-- CreateIndex
CREATE INDEX "salary_requests_status_idx" ON "salary_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "disbursals_salaryRequestId_key" ON "disbursals"("salaryRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "repayments_salaryRequestId_key" ON "repayments"("salaryRequestId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_limits" ADD CONSTRAINT "salary_limits_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_requests" ADD CONSTRAINT "salary_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_requests" ADD CONSTRAINT "salary_requests_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursals" ADD CONSTRAINT "disbursals_salaryRequestId_fkey" FOREIGN KEY ("salaryRequestId") REFERENCES "salary_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayments" ADD CONSTRAINT "repayments_salaryRequestId_fkey" FOREIGN KEY ("salaryRequestId") REFERENCES "salary_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
