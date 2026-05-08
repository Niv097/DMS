CREATE TABLE "NoteAccessGrant" (
    "id" SERIAL NOT NULL,
    "note_id" INTEGER NOT NULL,
    "granted_user_id" INTEGER NOT NULL,
    "granted_by_user_id" INTEGER NOT NULL,
    "access_level" TEXT NOT NULL DEFAULT 'VIEW',
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_user_id" INTEGER,
    "revoke_reason" TEXT,

    CONSTRAINT "NoteAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NoteAccessGrant_note_id_is_active_idx" ON "NoteAccessGrant"("note_id", "is_active");
CREATE INDEX "NoteAccessGrant_granted_user_id_is_active_idx" ON "NoteAccessGrant"("granted_user_id", "is_active");
CREATE INDEX "NoteAccessGrant_granted_by_user_id_idx" ON "NoteAccessGrant"("granted_by_user_id");

ALTER TABLE "NoteAccessGrant"
ADD CONSTRAINT "NoteAccessGrant_note_id_fkey"
FOREIGN KEY ("note_id") REFERENCES "Note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NoteAccessGrant"
ADD CONSTRAINT "NoteAccessGrant_granted_user_id_fkey"
FOREIGN KEY ("granted_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NoteAccessGrant"
ADD CONSTRAINT "NoteAccessGrant_granted_by_user_id_fkey"
FOREIGN KEY ("granted_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NoteAccessGrant"
ADD CONSTRAINT "NoteAccessGrant_revoked_by_user_id_fkey"
FOREIGN KEY ("revoked_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
