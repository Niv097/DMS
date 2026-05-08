ALTER TABLE "FmsDocument"
ADD COLUMN "version_group_key" TEXT,
ADD COLUMN "version_number" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "previous_version_id" INTEGER,
ADD COLUMN "is_latest_version" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "identity_reference" TEXT,
ADD COLUMN "document_reference" TEXT;

UPDATE "FmsDocument"
SET "version_group_key" = COALESCE("version_group_key", CONCAT('FMS-', "id"))
WHERE "version_group_key" IS NULL;

ALTER TABLE "FmsDocument"
ALTER COLUMN "version_group_key" SET NOT NULL;

CREATE TABLE "FmsNodeAccessGrant" (
  "id" SERIAL NOT NULL,
  "tenant_id" INTEGER NOT NULL,
  "node_id" INTEGER NOT NULL,
  "grant_type" TEXT NOT NULL,
  "user_id" INTEGER,
  "branch_id" INTEGER,
  "access_level" TEXT NOT NULL DEFAULT 'VIEW',
  "include_descendants" BOOLEAN NOT NULL DEFAULT true,
  "requested_by_user_id" INTEGER,
  "approved_by_user_id" INTEGER,
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "revoke_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FmsNodeAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FmsDocument_tenant_id_owner_node_id_is_latest_version_idx" ON "FmsDocument"("tenant_id", "owner_node_id", "is_latest_version");
CREATE INDEX "FmsDocument_tenant_id_identity_reference_idx" ON "FmsDocument"("tenant_id", "identity_reference");
CREATE INDEX "FmsDocument_tenant_id_document_reference_idx" ON "FmsDocument"("tenant_id", "document_reference");
CREATE INDEX "FmsDocument_version_group_key_version_number_idx" ON "FmsDocument"("version_group_key", "version_number");
CREATE INDEX "FmsDocument_version_group_key_is_latest_version_idx" ON "FmsDocument"("version_group_key", "is_latest_version");

CREATE INDEX "FmsNodeAccessGrant_tenant_id_node_id_revoked_at_idx" ON "FmsNodeAccessGrant"("tenant_id", "node_id", "revoked_at");
CREATE INDEX "FmsNodeAccessGrant_tenant_id_user_id_revoked_at_idx" ON "FmsNodeAccessGrant"("tenant_id", "user_id", "revoked_at");
CREATE INDEX "FmsNodeAccessGrant_tenant_id_branch_id_revoked_at_idx" ON "FmsNodeAccessGrant"("tenant_id", "branch_id", "revoked_at");

ALTER TABLE "FmsDocument"
ADD CONSTRAINT "FmsDocument_previous_version_id_fkey"
FOREIGN KEY ("previous_version_id") REFERENCES "FmsDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FmsNodeAccessGrant"
ADD CONSTRAINT "FmsNodeAccessGrant_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FmsNodeAccessGrant"
ADD CONSTRAINT "FmsNodeAccessGrant_node_id_fkey"
FOREIGN KEY ("node_id") REFERENCES "FmsNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FmsNodeAccessGrant"
ADD CONSTRAINT "FmsNodeAccessGrant_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FmsNodeAccessGrant"
ADD CONSTRAINT "FmsNodeAccessGrant_branch_id_fkey"
FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FmsNodeAccessGrant"
ADD CONSTRAINT "FmsNodeAccessGrant_requested_by_user_id_fkey"
FOREIGN KEY ("requested_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FmsNodeAccessGrant"
ADD CONSTRAINT "FmsNodeAccessGrant_approved_by_user_id_fkey"
FOREIGN KEY ("approved_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
