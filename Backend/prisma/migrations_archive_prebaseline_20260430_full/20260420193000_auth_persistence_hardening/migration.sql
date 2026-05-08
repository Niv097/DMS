-- Persist login lock state and authenticated sessions in PostgreSQL

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "failed_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lock_until" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_failed_attempts_lock_until_idx"
  ON "User"("failed_attempts", "lock_until");

CREATE TABLE IF NOT EXISTS "Session" (
  "id" UUID NOT NULL,
  "user_id" INTEGER NOT NULL,
  "last_activity" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "auth_methods" JSONB,
  "assurance_level" TEXT NOT NULL DEFAULT 'password',
  "step_up_eligible" BOOLEAN NOT NULL DEFAULT TRUE,
  "multiple_failed_attempts_detected" BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Session_user_id_idx" ON "Session"("user_id");
CREATE INDEX IF NOT EXISTS "Session_expires_at_idx" ON "Session"("expires_at");
