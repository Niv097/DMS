CREATE TABLE IF NOT EXISTS "LoginOtpChallenge" (
  "id" UUID NOT NULL,
  "user_id" INTEGER NOT NULL,
  "channel" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  CONSTRAINT "LoginOtpChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoginOtpChallenge_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "LoginOtpChallenge_user_id_created_at_idx"
  ON "LoginOtpChallenge"("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "LoginOtpChallenge_expires_at_idx"
  ON "LoginOtpChallenge"("expires_at");
