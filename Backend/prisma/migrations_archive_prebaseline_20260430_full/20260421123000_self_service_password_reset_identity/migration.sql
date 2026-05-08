ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "employee_id" TEXT,
  ADD COLUMN IF NOT EXISTS "date_of_birth" DATE;

CREATE UNIQUE INDEX IF NOT EXISTS "User_employee_id_key"
  ON "User"("employee_id")
  WHERE "employee_id" IS NOT NULL;
