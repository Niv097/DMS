ALTER TABLE "Tenant"
ADD COLUMN "cross_branch_append_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User"
ADD COLUMN "password_changed_at" TIMESTAMP(3);

CREATE TABLE "FmsBranchAppendRequest" (
  "id" SERIAL NOT NULL,
  "tenant_id" INTEGER NOT NULL,
  "requester_user_id" INTEGER NOT NULL,
  "requester_branch_id" INTEGER NOT NULL,
  "source_branch_id" INTEGER NOT NULL,
  "requested_access_level" TEXT NOT NULL DEFAULT 'VIEW',
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "decided_by_user_id" INTEGER,
  "decision_note" TEXT,
  "expires_at" TIMESTAMP(3),
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FmsBranchAppendRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FmsBranchAppendGrant" (
  "id" SERIAL NOT NULL,
  "tenant_id" INTEGER NOT NULL,
  "source_branch_id" INTEGER NOT NULL,
  "target_branch_id" INTEGER NOT NULL,
  "access_level" TEXT NOT NULL DEFAULT 'VIEW',
  "reason" TEXT,
  "request_id" INTEGER,
  "requested_by_user_id" INTEGER,
  "approved_by_user_id" INTEGER,
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "revoke_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FmsBranchAppendGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FmsBranchAppendRequest_tenant_id_status_created_at_idx" ON "FmsBranchAppendRequest"("tenant_id", "status", "created_at");
CREATE INDEX "FmsBranchAppendRequest_requester_branch_id_status_created_at_idx" ON "FmsBranchAppendRequest"("requester_branch_id", "status", "created_at");
CREATE INDEX "FmsBranchAppendRequest_source_branch_id_status_created_at_idx" ON "FmsBranchAppendRequest"("source_branch_id", "status", "created_at");

CREATE INDEX "FmsBranchAppendGrant_tenant_id_target_branch_id_revoked_at_idx" ON "FmsBranchAppendGrant"("tenant_id", "target_branch_id", "revoked_at");
CREATE INDEX "FmsBranchAppendGrant_tenant_id_source_branch_id_revoked_at_idx" ON "FmsBranchAppendGrant"("tenant_id", "source_branch_id", "revoked_at");
CREATE INDEX "FmsBranchAppendGrant_request_id_idx" ON "FmsBranchAppendGrant"("request_id");

ALTER TABLE "FmsBranchAppendRequest"
ADD CONSTRAINT "FmsBranchAppendRequest_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FmsBranchAppendRequest"
ADD CONSTRAINT "FmsBranchAppendRequest_requester_user_id_fkey"
FOREIGN KEY ("requester_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FmsBranchAppendRequest"
ADD CONSTRAINT "FmsBranchAppendRequest_requester_branch_id_fkey"
FOREIGN KEY ("requester_branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FmsBranchAppendRequest"
ADD CONSTRAINT "FmsBranchAppendRequest_source_branch_id_fkey"
FOREIGN KEY ("source_branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FmsBranchAppendRequest"
ADD CONSTRAINT "FmsBranchAppendRequest_decided_by_user_id_fkey"
FOREIGN KEY ("decided_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FmsBranchAppendGrant"
ADD CONSTRAINT "FmsBranchAppendGrant_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FmsBranchAppendGrant"
ADD CONSTRAINT "FmsBranchAppendGrant_source_branch_id_fkey"
FOREIGN KEY ("source_branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FmsBranchAppendGrant"
ADD CONSTRAINT "FmsBranchAppendGrant_target_branch_id_fkey"
FOREIGN KEY ("target_branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FmsBranchAppendGrant"
ADD CONSTRAINT "FmsBranchAppendGrant_request_id_fkey"
FOREIGN KEY ("request_id") REFERENCES "FmsBranchAppendRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FmsBranchAppendGrant"
ADD CONSTRAINT "FmsBranchAppendGrant_requested_by_user_id_fkey"
FOREIGN KEY ("requested_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FmsBranchAppendGrant"
ADD CONSTRAINT "FmsBranchAppendGrant_approved_by_user_id_fkey"
FOREIGN KEY ("approved_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
