-- Enforce ADR 005 (one active advance per employee) at the database level.
-- Prisma's schema DSL cannot express a partial unique index, so it's applied
-- here directly; app-level checks (EligibilityService, employerApprove) stay
-- as the primary UX gate, this index is the concurrency backstop.
CREATE UNIQUE INDEX "loan_applications_one_active_per_employee"
ON "loan_applications" ("employeeId")
WHERE "status" IN (
  'SUBMITTED',
  'EMPLOYER_APPROVED',
  'AWAITING_PLATFORM_FEE_PAYMENT',
  'READY_FOR_DISBURSAL',
  'DISBURSED',
  'REPAYMENT_SCHEDULED'
);
