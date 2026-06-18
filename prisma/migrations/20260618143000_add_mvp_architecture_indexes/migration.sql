-- Safe MVP architecture indexes for admin queues, audit lookups, and cleanup jobs.
CREATE UNIQUE INDEX IF NOT EXISTS "kyc_documents_employeeId_documentType_key"
ON "kyc_documents"("employeeId", "documentType");

CREATE INDEX IF NOT EXISTS "kyc_documents_status_idx"
ON "kyc_documents"("status");

CREATE INDEX IF NOT EXISTS "kyc_documents_status_employeeId_idx"
ON "kyc_documents"("status", "employeeId");

CREATE INDEX IF NOT EXISTS "employee_bank_accounts_verified_idx"
ON "employee_bank_accounts"("verified");

CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx"
ON "audit_logs"("createdAt");

CREATE INDEX IF NOT EXISTS "audit_logs_action_idx"
ON "audit_logs"("action");

CREATE INDEX IF NOT EXISTS "audit_logs_entityType_idx"
ON "audit_logs"("entityType");

CREATE INDEX IF NOT EXISTS "audit_logs_userId_idx"
ON "audit_logs"("userId");

CREATE INDEX IF NOT EXISTS "audit_logs_entityType_entityId_idx"
ON "audit_logs"("entityType", "entityId");

CREATE INDEX IF NOT EXISTS "notifications_userId_isRead_idx"
ON "notifications"("userId", "isRead");

CREATE INDEX IF NOT EXISTS "notifications_createdAt_idx"
ON "notifications"("createdAt");

CREATE INDEX IF NOT EXISTS "memberships_status_idx"
ON "memberships"("status");

CREATE INDEX IF NOT EXISTS "memberships_endDate_idx"
ON "memberships"("endDate");

CREATE INDEX IF NOT EXISTS "repayments_status_idx"
ON "repayments"("status");

CREATE INDEX IF NOT EXISTS "repayments_dueDate_idx"
ON "repayments"("dueDate");

CREATE INDEX IF NOT EXISTS "repayments_status_dueDate_idx"
ON "repayments"("status", "dueDate");

CREATE INDEX IF NOT EXISTS "employer_enquiries_status_idx"
ON "employer_enquiries"("status");

CREATE INDEX IF NOT EXISTS "employer_enquiries_createdAt_idx"
ON "employer_enquiries"("createdAt");

CREATE INDEX IF NOT EXISTS "user_sessions_isActive_updatedAt_idx"
ON "user_sessions"("isActive", "updatedAt");
