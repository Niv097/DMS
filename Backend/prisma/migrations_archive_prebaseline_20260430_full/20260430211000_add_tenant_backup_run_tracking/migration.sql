ALTER TABLE "Tenant"
ADD COLUMN IF NOT EXISTS "backup_last_completed_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "backup_next_due_at" TIMESTAMP(3);
