ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "temp_password_hash" TEXT;

UPDATE "User"
SET "must_change_password" = TRUE
WHERE "is_first_login" = TRUE;

CREATE INDEX IF NOT EXISTS "User_must_change_password_idx"
  ON "User"("must_change_password");
