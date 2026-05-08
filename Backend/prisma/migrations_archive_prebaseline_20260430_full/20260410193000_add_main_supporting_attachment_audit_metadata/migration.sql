ALTER TABLE "Attachment"
ALTER COLUMN "file_type" TYPE TEXT;

UPDATE "Attachment"
SET "file_type" = CASE
  WHEN UPPER("file_type") = 'MAIN_NOTE' THEN 'MAIN'
  WHEN UPPER("file_type") = 'ANNEXURE' THEN 'SUPPORTING'
  ELSE UPPER("file_type")
END;

ALTER TABLE "AuditLog"
ADD COLUMN "attachment_id" INTEGER,
ADD COLUMN "file_type" TEXT,
ADD COLUMN "file_name" TEXT;

CREATE INDEX "Attachment_note_id_file_type_idx" ON "Attachment"("note_id", "file_type");
CREATE INDEX "AuditLog_note_id_file_type_idx" ON "AuditLog"("note_id", "file_type");
CREATE INDEX "AuditLog_attachment_id_idx" ON "AuditLog"("attachment_id");

ALTER TABLE "AuditLog"
ADD CONSTRAINT "AuditLog_attachment_id_fkey"
FOREIGN KEY ("attachment_id") REFERENCES "Attachment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Attachment_single_main_per_note_idx"
ON "Attachment"("note_id")
WHERE "file_type" = 'MAIN';
