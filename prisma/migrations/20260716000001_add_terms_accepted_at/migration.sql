-- AlterTable: add termsAcceptedAt to users
-- Nullable — existing rows default to NULL (terms not yet accepted)
ALTER TABLE "users" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
