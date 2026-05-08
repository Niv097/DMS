CREATE TABLE "RejectionHighlight" (
    "id" SERIAL NOT NULL,
    "note_id" INTEGER NOT NULL,
    "document_group_key" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "page_number" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "created_by_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RejectionHighlight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RejectionHighlight_note_id_page_number_idx" ON "RejectionHighlight"("note_id", "page_number");
CREATE INDEX "RejectionHighlight_document_group_key_version_number_idx" ON "RejectionHighlight"("document_group_key", "version_number");

ALTER TABLE "RejectionHighlight"
ADD CONSTRAINT "RejectionHighlight_note_id_fkey"
FOREIGN KEY ("note_id") REFERENCES "Note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RejectionHighlight"
ADD CONSTRAINT "RejectionHighlight_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
