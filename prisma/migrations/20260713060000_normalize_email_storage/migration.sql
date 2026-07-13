-- Normalize email storage across login-facing tables.
-- API DTOs normalize before writes, while these constraints protect the database
-- from raw inserts or future code paths that accidentally preserve mixed-case
-- or padded emails.

UPDATE "users"
SET "email" = lower(btrim("email"))
WHERE "email" <> lower(btrim("email"));

UPDATE "employers"
SET "email" = lower(btrim("email"))
WHERE "email" <> lower(btrim("email"));

UPDATE "employees"
SET "email" = lower(btrim("email"))
WHERE "email" <> lower(btrim("email"));

UPDATE "employer_enquiries"
SET "email" = lower(btrim("email"))
WHERE "email" <> lower(btrim("email"));

-- Existing Prisma @unique indexes protect exact values. These functional indexes
-- additionally protect against case-insensitive duplicates at the database layer.
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_normalized_unique"
ON "users" (lower("email"));

CREATE UNIQUE INDEX IF NOT EXISTS "employers_email_normalized_unique"
ON "employers" (lower("email"));

DO $$
BEGIN
  ALTER TABLE "users"
    ADD CONSTRAINT "users_email_normalized_check"
    CHECK ("email" = lower(btrim("email")));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "employers"
    ADD CONSTRAINT "employers_email_normalized_check"
    CHECK ("email" = lower(btrim("email")));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "employees"
    ADD CONSTRAINT "employees_email_normalized_check"
    CHECK ("email" = lower(btrim("email")));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "employer_enquiries"
    ADD CONSTRAINT "employer_enquiries_email_normalized_check"
    CHECK ("email" = lower(btrim("email")));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
