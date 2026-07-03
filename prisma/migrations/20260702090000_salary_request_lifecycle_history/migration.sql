-- AlterEnum
ALTER TYPE "SalaryRequestStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "SalaryRequestStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- CreateTable
CREATE TABLE IF NOT EXISTS "salary_request_history" (
  "id" TEXT NOT NULL,
  "salaryRequestId" TEXT NOT NULL,
  "previousStatus" "SalaryRequestStatus",
  "newStatus" "SalaryRequestStatus" NOT NULL,
  "changedBy" TEXT,
  "actorRole" TEXT,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "salary_request_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "salary_request_history_salaryRequestId_createdAt_idx" ON "salary_request_history"("salaryRequestId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "salary_request_history_newStatus_idx" ON "salary_request_history"("newStatus");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'salary_request_history_salaryRequestId_fkey'
  ) THEN
    ALTER TABLE "salary_request_history"
    ADD CONSTRAINT "salary_request_history_salaryRequestId_fkey"
    FOREIGN KEY ("salaryRequestId") REFERENCES "salary_requests"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
