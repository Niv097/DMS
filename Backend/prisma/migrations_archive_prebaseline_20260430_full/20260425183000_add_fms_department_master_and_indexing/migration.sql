ALTER TABLE "FmsNode"
ADD COLUMN IF NOT EXISTS "department_master_id" INTEGER;

ALTER TABLE "FmsDocument"
ADD COLUMN IF NOT EXISTS "department_master_id" INTEGER,
ADD COLUMN IF NOT EXISTS "branch_id" INTEGER,
ADD COLUMN IF NOT EXISTS "document_category" TEXT,
ADD COLUMN IF NOT EXISTS "cif_reference" TEXT,
ADD COLUMN IF NOT EXISTS "id_proof_number" TEXT,
ADD COLUMN IF NOT EXISTS "tags_json" JSONB,
ADD COLUMN IF NOT EXISTS "custom_index_json" JSONB;

ALTER TABLE "FmsNodeAccessGrant"
ADD COLUMN IF NOT EXISTS "department_master_id" INTEGER;

CREATE TABLE IF NOT EXISTS "FmsDepartment" (
  "id" SERIAL NOT NULL,
  "tenant_id" INTEGER NOT NULL,
  "parent_id" INTEGER,
  "legacy_department_id" INTEGER,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "department_type" TEXT NOT NULL DEFAULT 'DEPARTMENT',
  "hierarchy_level" INTEGER NOT NULL DEFAULT 0,
  "path_key" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FmsDepartment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FmsDepartmentBranch" (
  "id" SERIAL NOT NULL,
  "tenant_id" INTEGER NOT NULL,
  "department_master_id" INTEGER NOT NULL,
  "branch_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FmsDepartmentBranch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FmsDepartment_tenant_id_path_key_key" ON "FmsDepartment"("tenant_id", "path_key");
CREATE UNIQUE INDEX IF NOT EXISTS "FmsDepartment_tenant_id_code_parent_id_key" ON "FmsDepartment"("tenant_id", "code", "parent_id");
CREATE INDEX IF NOT EXISTS "FmsDepartment_tenant_id_parent_id_is_active_idx" ON "FmsDepartment"("tenant_id", "parent_id", "is_active");
CREATE INDEX IF NOT EXISTS "FmsDepartment_legacy_department_id_idx" ON "FmsDepartment"("legacy_department_id");

CREATE UNIQUE INDEX IF NOT EXISTS "FmsDepartmentBranch_department_master_id_branch_id_key" ON "FmsDepartmentBranch"("department_master_id", "branch_id");
CREATE INDEX IF NOT EXISTS "FmsDepartmentBranch_tenant_id_branch_id_idx" ON "FmsDepartmentBranch"("tenant_id", "branch_id");

CREATE INDEX IF NOT EXISTS "FmsNode_department_master_id_idx" ON "FmsNode"("department_master_id");
CREATE INDEX IF NOT EXISTS "FmsDocument_tenant_id_department_master_id_status_idx" ON "FmsDocument"("tenant_id", "department_master_id", "status");
CREATE INDEX IF NOT EXISTS "FmsDocument_tenant_id_branch_id_status_idx" ON "FmsDocument"("tenant_id", "branch_id", "status");
CREATE INDEX IF NOT EXISTS "FmsDocument_tenant_id_document_category_created_at_idx" ON "FmsDocument"("tenant_id", "document_category", "created_at");
CREATE INDEX IF NOT EXISTS "FmsDocument_tenant_id_cif_reference_idx" ON "FmsDocument"("tenant_id", "cif_reference");
CREATE INDEX IF NOT EXISTS "FmsDocument_tenant_id_id_proof_number_idx" ON "FmsDocument"("tenant_id", "id_proof_number");
CREATE INDEX IF NOT EXISTS "FmsNodeAccessGrant_tenant_id_department_master_id_revoked_at_idx" ON "FmsNodeAccessGrant"("tenant_id", "department_master_id", "revoked_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FmsDepartment_tenant_id_fkey'
  ) THEN
    ALTER TABLE "FmsDepartment"
    ADD CONSTRAINT "FmsDepartment_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FmsDepartment_parent_id_fkey'
  ) THEN
    ALTER TABLE "FmsDepartment"
    ADD CONSTRAINT "FmsDepartment_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "FmsDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FmsDepartment_legacy_department_id_fkey'
  ) THEN
    ALTER TABLE "FmsDepartment"
    ADD CONSTRAINT "FmsDepartment_legacy_department_id_fkey"
    FOREIGN KEY ("legacy_department_id") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FmsDepartmentBranch_tenant_id_fkey'
  ) THEN
    ALTER TABLE "FmsDepartmentBranch"
    ADD CONSTRAINT "FmsDepartmentBranch_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FmsDepartmentBranch_department_master_id_fkey'
  ) THEN
    ALTER TABLE "FmsDepartmentBranch"
    ADD CONSTRAINT "FmsDepartmentBranch_department_master_id_fkey"
    FOREIGN KEY ("department_master_id") REFERENCES "FmsDepartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FmsDepartmentBranch_branch_id_fkey'
  ) THEN
    ALTER TABLE "FmsDepartmentBranch"
    ADD CONSTRAINT "FmsDepartmentBranch_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FmsNode_department_master_id_fkey'
  ) THEN
    ALTER TABLE "FmsNode"
    ADD CONSTRAINT "FmsNode_department_master_id_fkey"
    FOREIGN KEY ("department_master_id") REFERENCES "FmsDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FmsDocument_department_master_id_fkey'
  ) THEN
    ALTER TABLE "FmsDocument"
    ADD CONSTRAINT "FmsDocument_department_master_id_fkey"
    FOREIGN KEY ("department_master_id") REFERENCES "FmsDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FmsDocument_branch_id_fkey'
  ) THEN
    ALTER TABLE "FmsDocument"
    ADD CONSTRAINT "FmsDocument_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FmsNodeAccessGrant_department_master_id_fkey'
  ) THEN
    ALTER TABLE "FmsNodeAccessGrant"
    ADD CONSTRAINT "FmsNodeAccessGrant_department_master_id_fkey"
    FOREIGN KEY ("department_master_id") REFERENCES "FmsDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
