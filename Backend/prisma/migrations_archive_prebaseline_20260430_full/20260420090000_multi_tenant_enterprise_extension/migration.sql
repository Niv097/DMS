-- Multi-tenant, branch-aware banking DMS extension

CREATE TABLE IF NOT EXISTS "Tenant" (
  "id" SERIAL PRIMARY KEY,
  "tenant_name" TEXT NOT NULL,
  "tenant_code" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Branch" (
  "id" SERIAL PRIMARY KEY,
  "branch_name" TEXT NOT NULL,
  "branch_code" TEXT NOT NULL,
  "tenant_id" INTEGER NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Branch_tenant_id_branch_code_key" UNIQUE ("tenant_id", "branch_code")
);

CREATE TABLE IF NOT EXISTS "UserBranchAccess" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "branch_id" INTEGER NOT NULL REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBranchAccess_user_id_branch_id_key" UNIQUE ("user_id", "branch_id")
);

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "username" TEXT,
  ADD COLUMN IF NOT EXISTS "tenant_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "branch_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "is_first_login" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "accessible_branch_ids" JSONB;

ALTER TABLE "Note"
  ADD COLUMN IF NOT EXISTS "document_code" TEXT,
  ADD COLUMN IF NOT EXISTS "tenant_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "branch_id" INTEGER;

ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "tenant_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "branch_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "version_number" INTEGER;

DO $$
DECLARE
  default_tenant_id INTEGER;
  default_branch_id INTEGER;
BEGIN
  INSERT INTO "Tenant" ("tenant_name", "tenant_code")
  VALUES ('Default Demo Bank', 'DMS')
  ON CONFLICT ("tenant_code") DO UPDATE SET "tenant_name" = EXCLUDED."tenant_name"
  RETURNING "id" INTO default_tenant_id;

  INSERT INTO "Branch" ("branch_name", "branch_code", "tenant_id")
  VALUES ('Head Office', 'HO', default_tenant_id)
  ON CONFLICT ("tenant_id", "branch_code") DO UPDATE SET "branch_name" = EXCLUDED."branch_name"
  RETURNING "id" INTO default_branch_id;

  UPDATE "User"
  SET
    "tenant_id" = COALESCE("tenant_id", default_tenant_id),
    "branch_id" = COALESCE("branch_id", default_branch_id),
    "username" = COALESCE("username", split_part(lower("email"), '@', 1)),
    "user_id" = COALESCE("user_id", 'DMS-HO-USR-' || lpad("id"::text, 4, '0')),
    "is_active" = COALESCE("is_active", TRUE),
    "is_first_login" = COALESCE("is_first_login", FALSE)
  WHERE "tenant_id" IS NULL
     OR "branch_id" IS NULL
     OR "username" IS NULL
     OR "user_id" IS NULL;

  UPDATE "Note"
  SET
    "tenant_id" = COALESCE("tenant_id", default_tenant_id),
    "branch_id" = COALESCE("branch_id", default_branch_id),
    "document_code" = COALESCE("document_code", "note_id")
  WHERE "tenant_id" IS NULL
     OR "branch_id" IS NULL
     OR "document_code" IS NULL;

  UPDATE "AuditLog" a
  SET
    "tenant_id" = COALESCE(a."tenant_id", n."tenant_id"),
    "branch_id" = COALESCE(a."branch_id", n."branch_id"),
    "version_number" = COALESCE(a."version_number", n."version_number")
  FROM "Note" n
  WHERE a."note_id" = n."id"
    AND (a."tenant_id" IS NULL OR a."branch_id" IS NULL OR a."version_number" IS NULL);
END $$;

ALTER TABLE "User"
  ADD CONSTRAINT "User_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User"
  ADD CONSTRAINT "User_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Note"
  ADD CONSTRAINT "Note_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Note"
  ADD CONSTRAINT "Note_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "User_user_id_key" ON "User"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "Note_document_code_key" ON "Note"("document_code");
CREATE INDEX IF NOT EXISTS "Note_tenant_id_branch_id_status_idx" ON "Note"("tenant_id", "branch_id", "status");
CREATE INDEX IF NOT EXISTS "AuditLog_tenant_id_branch_id_timestamp_idx" ON "AuditLog"("tenant_id", "branch_id", "timestamp");

INSERT INTO "Role" ("name")
VALUES ('SUPER_ADMIN')
ON CONFLICT ("name") DO NOTHING;
