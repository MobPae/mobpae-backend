-- Add selector for efficient password reset token lookup.
-- Existing reset tokens without a selector are intentionally not usable by the new flow.
ALTER TABLE "password_reset_tokens"
ADD COLUMN "tokenSelector" TEXT;

CREATE UNIQUE INDEX "password_reset_tokens_tokenSelector_key"
ON "password_reset_tokens"("tokenSelector");
