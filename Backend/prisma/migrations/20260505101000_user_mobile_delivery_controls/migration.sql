ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "mobile_number" TEXT;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "credential_delivery_mode" TEXT NOT NULL DEFAULT 'EMAIL';

UPDATE "User"
SET "credential_delivery_mode" = 'EMAIL'
WHERE "credential_delivery_mode" IS NULL;

ALTER TABLE "User"
DROP CONSTRAINT IF EXISTS "User_email_key";

CREATE UNIQUE INDEX IF NOT EXISTS "User_employee_id_key"
ON "User"("employee_id");
