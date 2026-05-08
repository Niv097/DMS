ALTER TABLE "Note"
ADD COLUMN "workflow_state" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "queue_code" TEXT NOT NULL DEFAULT 'DRAFTS',
ADD COLUMN "current_owner_user_id" INTEGER,
ADD COLUMN "next_responsible_user_id" INTEGER,
ADD COLUMN "last_action_by_user_id" INTEGER,
ADD COLUMN "submitted_at" TIMESTAMP(3),
ADD COLUMN "last_moved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "closed_at" TIMESTAMP(3);

ALTER TABLE "Note"
ADD CONSTRAINT "Note_current_owner_user_id_fkey"
FOREIGN KEY ("current_owner_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Note"
ADD CONSTRAINT "Note_next_responsible_user_id_fkey"
FOREIGN KEY ("next_responsible_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Note"
ADD CONSTRAINT "Note_last_action_by_user_id_fkey"
FOREIGN KEY ("last_action_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "NoteMovement" (
  "id" SERIAL NOT NULL,
  "note_id" INTEGER NOT NULL,
  "tenant_id" INTEGER,
  "branch_id" INTEGER,
  "from_state" TEXT,
  "to_state" TEXT NOT NULL,
  "from_queue" TEXT,
  "to_queue" TEXT,
  "from_user_id" INTEGER,
  "to_user_id" INTEGER,
  "acted_by_user_id" INTEGER NOT NULL,
  "action_type" TEXT NOT NULL,
  "remark_text" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NoteMovement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "NoteMovement"
ADD CONSTRAINT "NoteMovement_note_id_fkey"
FOREIGN KEY ("note_id") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NoteMovement"
ADD CONSTRAINT "NoteMovement_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NoteMovement"
ADD CONSTRAINT "NoteMovement_branch_id_fkey"
FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NoteMovement"
ADD CONSTRAINT "NoteMovement_from_user_id_fkey"
FOREIGN KEY ("from_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NoteMovement"
ADD CONSTRAINT "NoteMovement_to_user_id_fkey"
FOREIGN KEY ("to_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NoteMovement"
ADD CONSTRAINT "NoteMovement_acted_by_user_id_fkey"
FOREIGN KEY ("acted_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "Note" AS n
SET
  "workflow_state" = CASE
    WHEN n."status" IN ('FINAL_APPROVED', 'ARCHIVED', 'SUPERSEDED') THEN 'APPROVED'
    WHEN n."status" = 'REJECTED' THEN 'RETURNED_WITH_REMARK'
    WHEN n."status" = 'RECOMMENDED' THEN 'UNDER_REVIEW'
    WHEN EXISTS (SELECT 1 FROM "WorkflowStep" ws WHERE ws."note_id" = n."id") THEN 'SUBMITTED'
    ELSE 'DRAFT'
  END,
  "queue_code" = CASE
    WHEN n."status" IN ('FINAL_APPROVED', 'ARCHIVED', 'SUPERSEDED') THEN 'APPROVED_CLOSED_HISTORY'
    WHEN n."status" = 'REJECTED' THEN 'RETURNED_WITH_REMARKS'
    WHEN EXISTS (SELECT 1 FROM "WorkflowStep" ws WHERE ws."note_id" = n."id") THEN 'INCOMING'
    ELSE 'DRAFTS'
  END,
  "current_owner_user_id" = CASE
    WHEN n."status" = 'RECOMMENDED' THEN (
      SELECT ws."assigned_user_id"
      FROM "WorkflowStep" ws
      WHERE ws."note_id" = n."id" AND ws."role_type" = 'APPROVER'
      ORDER BY ws."sequence" ASC
      LIMIT 1
    )
    WHEN n."status" = 'UPLOADED' AND EXISTS (SELECT 1 FROM "WorkflowStep" ws WHERE ws."note_id" = n."id") THEN (
      SELECT ws."assigned_user_id"
      FROM "WorkflowStep" ws
      WHERE ws."note_id" = n."id" AND ws."role_type" = 'RECOMMENDER'
      ORDER BY ws."sequence" ASC
      LIMIT 1
    )
    ELSE n."initiator_id"
  END,
  "next_responsible_user_id" = CASE
    WHEN n."status" = 'RECOMMENDED' THEN (
      SELECT ws."assigned_user_id"
      FROM "WorkflowStep" ws
      WHERE ws."note_id" = n."id" AND ws."role_type" = 'APPROVER'
      ORDER BY ws."sequence" ASC
      LIMIT 1
    )
    WHEN n."status" = 'UPLOADED' AND EXISTS (SELECT 1 FROM "WorkflowStep" ws WHERE ws."note_id" = n."id") THEN (
      SELECT ws."assigned_user_id"
      FROM "WorkflowStep" ws
      WHERE ws."note_id" = n."id" AND ws."role_type" = 'RECOMMENDER'
      ORDER BY ws."sequence" ASC
      LIMIT 1
    )
    WHEN n."status" = 'REJECTED' THEN n."initiator_id"
    ELSE NULL
  END,
  "last_action_by_user_id" = COALESCE(
    (
      SELECT ws."assigned_user_id"
      FROM "WorkflowStep" ws
      WHERE ws."note_id" = n."id" AND ws."action_date" IS NOT NULL
      ORDER BY ws."action_date" DESC, ws."sequence" DESC
      LIMIT 1
    ),
    n."initiator_id"
  ),
  "submitted_at" = CASE
    WHEN EXISTS (SELECT 1 FROM "WorkflowStep" ws WHERE ws."note_id" = n."id") THEN n."created_at"
    ELSE NULL
  END,
  "closed_at" = CASE
    WHEN n."status" IN ('FINAL_APPROVED', 'ARCHIVED', 'SUPERSEDED') THEN COALESCE(n."approved_at", n."updated_at")
    ELSE NULL
  END,
  "last_moved_at" = COALESCE(n."updated_at", n."created_at");

CREATE INDEX "Note_workflow_state_is_latest_version_idx" ON "Note"("workflow_state", "is_latest_version");
CREATE INDEX "Note_queue_code_current_owner_user_id_is_latest_version_idx" ON "Note"("queue_code", "current_owner_user_id", "is_latest_version");
CREATE INDEX "Note_current_owner_user_id_workflow_state_idx" ON "Note"("current_owner_user_id", "workflow_state");
CREATE INDEX "Note_next_responsible_user_id_workflow_state_idx" ON "Note"("next_responsible_user_id", "workflow_state");
CREATE INDEX "NoteMovement_note_id_created_at_idx" ON "NoteMovement"("note_id", "created_at");
CREATE INDEX "NoteMovement_acted_by_user_id_created_at_idx" ON "NoteMovement"("acted_by_user_id", "created_at");
CREATE INDEX "NoteMovement_from_user_id_created_at_idx" ON "NoteMovement"("from_user_id", "created_at");
CREATE INDEX "NoteMovement_to_user_id_created_at_idx" ON "NoteMovement"("to_user_id", "created_at");
CREATE INDEX "NoteMovement_tenant_id_branch_id_created_at_idx" ON "NoteMovement"("tenant_id", "branch_id", "created_at");
