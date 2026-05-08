ALTER TABLE "Note"
ADD COLUMN "document_group_key" TEXT,
ADD COLUMN "version_number" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "previous_version_id" INTEGER,
ADD COLUMN "is_latest_version" BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN "approved_file_name" TEXT,
ADD COLUMN "approved_file_path" TEXT,
ADD COLUMN "approved_file_mime" TEXT,
ADD COLUMN "approved_at" TIMESTAMP(3),
ADD COLUMN "approved_by_name" TEXT,
ADD COLUMN "approved_by_role" TEXT,
ADD COLUMN "approval_note" TEXT,
ADD COLUMN "archived_at" TIMESTAMP(3);

UPDATE "Note"
SET "document_group_key" = "note_id"
WHERE "document_group_key" IS NULL;

ALTER TABLE "Note"
ALTER COLUMN "document_group_key" SET NOT NULL;

CREATE INDEX "Note_document_group_key_version_number_idx" ON "Note"("document_group_key", "version_number");
CREATE INDEX "Note_document_group_key_is_latest_version_idx" ON "Note"("document_group_key", "is_latest_version");
CREATE INDEX "Note_status_is_latest_version_idx" ON "Note"("status", "is_latest_version");

ALTER TABLE "Note"
ADD CONSTRAINT "Note_previous_version_id_fkey"
FOREIGN KEY ("previous_version_id") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
