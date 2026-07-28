-- Employee.email had no uniqueness constraint or index at all (duplicate
-- employees with the same email were possible, and lookups by email were
-- unindexed). User.email is already globally unique and every Employee is
-- created together with a matching User in the same transaction, so this
-- mirrors that existing invariant.
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- Missing FK indexes on frequently-filtered columns.
CREATE INDEX "loan_applications_configId_idx" ON "loan_applications"("configId");

CREATE INDEX "loan_applications_fundingPartnerId_idx" ON "loan_applications"("fundingPartnerId");

CREATE INDEX "settlement_line_items_loanApplicationId_idx" ON "settlement_line_items"("loanApplicationId");

CREATE INDEX "settlement_line_items_employeeId_idx" ON "settlement_line_items"("employeeId");
