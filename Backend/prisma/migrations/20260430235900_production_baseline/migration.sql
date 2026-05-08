-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "email" TEXT NOT NULL,
    "employee_id" TEXT,
    "date_of_birth" DATE,
    "password_hash" TEXT NOT NULL,
    "role_id" INTEGER NOT NULL,
    "tenant_id" INTEGER,
    "branch_id" INTEGER,
    "department_id" INTEGER,
    "vertical_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_first_login" BOOLEAN NOT NULL DEFAULT false,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "temp_password_hash" TEXT,
    "accessible_branch_ids" JSONB,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "lock_until" TIMESTAMP(3),
    "fms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "fms_permissions" JSONB,
    "password_changed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginOtpChallenge" (
    "id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,

    CONSTRAINT "LoginOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "last_activity" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auth_methods" JSONB,
    "assurance_level" TEXT NOT NULL DEFAULT 'password',
    "step_up_eligible" BOOLEAN NOT NULL DEFAULT true,
    "multiple_failed_attempts_detected" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" SERIAL NOT NULL,
    "tenant_name" TEXT NOT NULL,
    "tenant_code" TEXT NOT NULL,
    "deployment_host" TEXT,
    "brand_display_name" TEXT,
    "brand_short_code" TEXT,
    "brand_logo_path" TEXT,
    "brand_watermark_text" TEXT,
    "brand_subtitle" TEXT,
    "cross_branch_append_enabled" BOOLEAN NOT NULL DEFAULT false,
    "backup_policy_enabled" BOOLEAN NOT NULL DEFAULT true,
    "backup_frequency" TEXT NOT NULL DEFAULT 'DAILY',
    "backup_retention_days" INTEGER NOT NULL DEFAULT 30,
    "backup_window_hour" INTEGER NOT NULL DEFAULT 18,
    "backup_window_minute" INTEGER NOT NULL DEFAULT 0,
    "vendor_mirror_enabled" BOOLEAN NOT NULL DEFAULT true,
    "backup_last_completed_at" TIMESTAMP(3),
    "backup_next_due_at" TIMESTAMP(3),
    "fms_record_type_master_json" JSONB,
    "fms_record_desk_master_json" JSONB,
    "fms_classification_master_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "city_name" TEXT NOT NULL,
    "city_code" TEXT NOT NULL,
    "state_name" TEXT,
    "state_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" SERIAL NOT NULL,
    "branch_name" TEXT NOT NULL,
    "branch_code" TEXT NOT NULL,
    "branch_address" TEXT,
    "tenant_id" INTEGER NOT NULL,
    "city_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBranchAccess" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "branch_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBranchAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vertical" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Vertical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" SERIAL NOT NULL,
    "note_id" TEXT NOT NULL,
    "document_code" TEXT,
    "document_group_key" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "previous_version_id" INTEGER,
    "is_latest_version" BOOLEAN NOT NULL DEFAULT true,
    "subject" TEXT NOT NULL,
    "note_type" TEXT NOT NULL,
    "workflow_type" TEXT NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'INTERNAL',
    "initiator_id" INTEGER NOT NULL,
    "tenant_id" INTEGER,
    "branch_id" INTEGER,
    "department_id" INTEGER NOT NULL,
    "vertical_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "workflow_state" TEXT NOT NULL DEFAULT 'DRAFT',
    "queue_code" TEXT NOT NULL DEFAULT 'DRAFTS',
    "current_owner_user_id" INTEGER,
    "next_responsible_user_id" INTEGER,
    "last_action_by_user_id" INTEGER,
    "submitted_at" TIMESTAMP(3),
    "last_moved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "approved_file_name" TEXT,
    "approved_file_path" TEXT,
    "approved_file_mime" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by_name" TEXT,
    "approved_by_role" TEXT,
    "approval_note" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStep" (
    "id" SERIAL NOT NULL,
    "note_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "role_type" TEXT NOT NULL,
    "assigned_user_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "action_date" TIMESTAMP(3),

    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" SERIAL NOT NULL,
    "note_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" SERIAL NOT NULL,
    "note_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "comment_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "note_id" INTEGER NOT NULL,
    "tenant_id" INTEGER,
    "branch_id" INTEGER,
    "version_number" INTEGER,
    "attachment_id" INTEGER,
    "file_type" TEXT,
    "file_name" TEXT,
    "action" TEXT NOT NULL,
    "performed_by" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "remarks" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteAction" (
    "id" SERIAL NOT NULL,
    "note_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action_type" TEXT NOT NULL,
    "comment" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "tenant_id" INTEGER,
    "branch_id" INTEGER,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "entity_type" TEXT,
    "entity_id" INTEGER,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FmsNode" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "branch_id" INTEGER,
    "department_master_id" INTEGER,
    "parent_id" INTEGER,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "node_type" TEXT NOT NULL,
    "path_key" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FmsNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FmsDocument" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "owner_node_id" INTEGER NOT NULL,
    "department_master_id" INTEGER,
    "branch_id" INTEGER,
    "source_note_id" INTEGER,
    "version_group_key" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "previous_version_id" INTEGER,
    "is_latest_version" BOOLEAN NOT NULL DEFAULT true,
    "classification" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_category" TEXT,
    "title" TEXT NOT NULL,
    "customer_name" TEXT,
    "customer_reference" TEXT NOT NULL,
    "cif_reference" TEXT,
    "account_reference" TEXT,
    "identity_reference" TEXT,
    "id_proof_number" TEXT,
    "document_reference" TEXT,
    "file_name" TEXT NOT NULL,
    "stored_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_extension" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_hash" TEXT NOT NULL,
    "file_kind" TEXT NOT NULL,
    "uploaded_by_user_id" INTEGER NOT NULL,
    "published_by_user_id" INTEGER,
    "tags_json" JSONB,
    "custom_index_json" JSONB,
    "metadata_json" JSONB NOT NULL,
    "search_text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FmsDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FmsNodeAccessGrant" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "node_id" INTEGER NOT NULL,
    "grant_type" TEXT NOT NULL,
    "user_id" INTEGER,
    "branch_id" INTEGER,
    "department_master_id" INTEGER,
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

-- CreateTable
CREATE TABLE "FmsDepartment" (
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
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FmsDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FmsDepartmentBranch" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "department_master_id" INTEGER NOT NULL,
    "branch_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FmsDepartmentBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FmsDocumentAccessGrant" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "grant_type" TEXT NOT NULL,
    "user_id" INTEGER,
    "branch_id" INTEGER,
    "requested_by_user_id" INTEGER,
    "approved_by_user_id" INTEGER,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FmsDocumentAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FmsAccessRequest" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "requester_user_id" INTEGER NOT NULL,
    "requester_branch_id" INTEGER,
    "owner_node_id" INTEGER NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_user_id" INTEGER,
    "target_branch_id" INTEGER,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decided_by_user_id" INTEGER,
    "decision_note" TEXT,
    "expires_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FmsAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FmsAuditLog" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER,
    "owner_node_id" INTEGER,
    "document_id" INTEGER,
    "request_id" INTEGER,
    "actor_user_id" INTEGER,
    "action" TEXT NOT NULL,
    "remarks" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FmsAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "User_user_id_key" ON "User"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employee_id_key" ON "User"("employee_id");

-- CreateIndex
CREATE INDEX "LoginOtpChallenge_user_id_created_at_idx" ON "LoginOtpChallenge"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "LoginOtpChallenge_expires_at_idx" ON "LoginOtpChallenge"("expires_at");

-- CreateIndex
CREATE INDEX "Session_user_id_idx" ON "Session"("user_id");

-- CreateIndex
CREATE INDEX "Session_expires_at_idx" ON "Session"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_tenant_code_key" ON "Tenant"("tenant_code");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_deployment_host_key" ON "Tenant"("deployment_host");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_tenant_name_tenant_code_key" ON "Tenant"("tenant_name", "tenant_code");

-- CreateIndex
CREATE INDEX "City_tenant_id_city_name_idx" ON "City"("tenant_id", "city_name");

-- CreateIndex
CREATE UNIQUE INDEX "City_tenant_id_city_name_key" ON "City"("tenant_id", "city_name");

-- CreateIndex
CREATE UNIQUE INDEX "City_tenant_id_city_code_key" ON "City"("tenant_id", "city_code");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_tenant_id_branch_code_key" ON "Branch"("tenant_id", "branch_code");

-- CreateIndex
CREATE UNIQUE INDEX "UserBranchAccess_user_id_branch_id_key" ON "UserBranchAccess"("user_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Vertical_name_key" ON "Vertical"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Note_note_id_key" ON "Note"("note_id");

-- CreateIndex
CREATE UNIQUE INDEX "Note_document_code_key" ON "Note"("document_code");

-- CreateIndex
CREATE INDEX "Note_document_group_key_version_number_idx" ON "Note"("document_group_key", "version_number");

-- CreateIndex
CREATE INDEX "Note_document_group_key_is_latest_version_idx" ON "Note"("document_group_key", "is_latest_version");

-- CreateIndex
CREATE INDEX "Note_status_is_latest_version_idx" ON "Note"("status", "is_latest_version");

-- CreateIndex
CREATE INDEX "Note_workflow_state_is_latest_version_idx" ON "Note"("workflow_state", "is_latest_version");

-- CreateIndex
CREATE INDEX "Note_queue_code_current_owner_user_id_is_latest_version_idx" ON "Note"("queue_code", "current_owner_user_id", "is_latest_version");

-- CreateIndex
CREATE INDEX "Note_current_owner_user_id_workflow_state_idx" ON "Note"("current_owner_user_id", "workflow_state");

-- CreateIndex
CREATE INDEX "Note_next_responsible_user_id_workflow_state_idx" ON "Note"("next_responsible_user_id", "workflow_state");

-- CreateIndex
CREATE INDEX "Note_tenant_id_branch_id_status_idx" ON "Note"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "Attachment_note_id_file_type_idx" ON "Attachment"("note_id", "file_type");

-- CreateIndex
CREATE INDEX "AuditLog_note_id_file_type_idx" ON "AuditLog"("note_id", "file_type");

-- CreateIndex
CREATE INDEX "AuditLog_attachment_id_idx" ON "AuditLog"("attachment_id");

-- CreateIndex
CREATE INDEX "AuditLog_tenant_id_branch_id_timestamp_idx" ON "AuditLog"("tenant_id", "branch_id", "timestamp");

-- CreateIndex
CREATE INDEX "NoteMovement_note_id_created_at_idx" ON "NoteMovement"("note_id", "created_at");

-- CreateIndex
CREATE INDEX "NoteMovement_acted_by_user_id_created_at_idx" ON "NoteMovement"("acted_by_user_id", "created_at");

-- CreateIndex
CREATE INDEX "NoteMovement_from_user_id_created_at_idx" ON "NoteMovement"("from_user_id", "created_at");

-- CreateIndex
CREATE INDEX "NoteMovement_to_user_id_created_at_idx" ON "NoteMovement"("to_user_id", "created_at");

-- CreateIndex
CREATE INDEX "NoteMovement_tenant_id_branch_id_created_at_idx" ON "NoteMovement"("tenant_id", "branch_id", "created_at");

-- CreateIndex
CREATE INDEX "RejectionHighlight_note_id_page_number_idx" ON "RejectionHighlight"("note_id", "page_number");

-- CreateIndex
CREATE INDEX "RejectionHighlight_document_group_key_version_number_idx" ON "RejectionHighlight"("document_group_key", "version_number");

-- CreateIndex
CREATE INDEX "Notification_user_id_is_read_created_at_idx" ON "Notification"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "Notification_tenant_id_branch_id_created_at_idx" ON "Notification"("tenant_id", "branch_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "FmsNode_path_key_key" ON "FmsNode"("path_key");

-- CreateIndex
CREATE INDEX "FmsNode_tenant_id_node_type_is_active_idx" ON "FmsNode"("tenant_id", "node_type", "is_active");

-- CreateIndex
CREATE INDEX "FmsNode_branch_id_idx" ON "FmsNode"("branch_id");

-- CreateIndex
CREATE INDEX "FmsNode_department_master_id_idx" ON "FmsNode"("department_master_id");

-- CreateIndex
CREATE UNIQUE INDEX "FmsNode_tenant_id_code_parent_id_key" ON "FmsNode"("tenant_id", "code", "parent_id");

-- CreateIndex
CREATE INDEX "FmsDocument_tenant_id_owner_node_id_status_idx" ON "FmsDocument"("tenant_id", "owner_node_id", "status");

-- CreateIndex
CREATE INDEX "FmsDocument_tenant_id_owner_node_id_is_latest_version_idx" ON "FmsDocument"("tenant_id", "owner_node_id", "is_latest_version");

-- CreateIndex
CREATE INDEX "FmsDocument_tenant_id_department_master_id_status_idx" ON "FmsDocument"("tenant_id", "department_master_id", "status");

-- CreateIndex
CREATE INDEX "FmsDocument_tenant_id_branch_id_status_idx" ON "FmsDocument"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "FmsDocument_tenant_id_document_type_created_at_idx" ON "FmsDocument"("tenant_id", "document_type", "created_at");

-- CreateIndex
CREATE INDEX "FmsDocument_tenant_id_document_category_created_at_idx" ON "FmsDocument"("tenant_id", "document_category", "created_at");

-- CreateIndex
CREATE INDEX "FmsDocument_tenant_id_classification_created_at_idx" ON "FmsDocument"("tenant_id", "classification", "created_at");

-- CreateIndex
CREATE INDEX "FmsDocument_tenant_id_title_idx" ON "FmsDocument"("tenant_id", "title");

-- CreateIndex
CREATE INDEX "FmsDocument_tenant_id_file_name_idx" ON "FmsDocument"("tenant_id", "file_name");

-- CreateIndex
CREATE INDEX "FmsDocument_tenant_id_customer_name_idx" ON "FmsDocument"("tenant_id", "customer_name");

-- CreateIndex
CREATE INDEX "FmsDocument_tenant_id_cif_reference_idx" ON "FmsDocument"("tenant_id", "cif_reference");

-- CreateIndex
CREATE INDEX "FmsDocument_tenant_id_identity_reference_idx" ON "FmsDocument"("tenant_id", "identity_reference");

-- CreateIndex
CREATE INDEX "FmsDocument_tenant_id_id_proof_number_idx" ON "FmsDocument"("tenant_id", "id_proof_number");

-- CreateIndex
CREATE INDEX "FmsDocument_tenant_id_document_reference_idx" ON "FmsDocument"("tenant_id", "document_reference");

-- CreateIndex
CREATE INDEX "FmsDocument_tenant_id_search_text_idx" ON "FmsDocument"("tenant_id", "search_text");

-- CreateIndex
CREATE INDEX "FmsDocument_version_group_key_version_number_idx" ON "FmsDocument"("version_group_key", "version_number");

-- CreateIndex
CREATE INDEX "FmsDocument_version_group_key_is_latest_version_idx" ON "FmsDocument"("version_group_key", "is_latest_version");

-- CreateIndex
CREATE INDEX "FmsDocument_customer_reference_idx" ON "FmsDocument"("customer_reference");

-- CreateIndex
CREATE INDEX "FmsDocument_account_reference_idx" ON "FmsDocument"("account_reference");

-- CreateIndex
CREATE INDEX "FmsDocument_uploaded_by_user_id_created_at_idx" ON "FmsDocument"("uploaded_by_user_id", "created_at");

-- CreateIndex
CREATE INDEX "FmsNodeAccessGrant_tenant_id_node_id_revoked_at_idx" ON "FmsNodeAccessGrant"("tenant_id", "node_id", "revoked_at");

-- CreateIndex
CREATE INDEX "FmsNodeAccessGrant_tenant_id_user_id_revoked_at_idx" ON "FmsNodeAccessGrant"("tenant_id", "user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "FmsNodeAccessGrant_tenant_id_branch_id_revoked_at_idx" ON "FmsNodeAccessGrant"("tenant_id", "branch_id", "revoked_at");

-- CreateIndex
CREATE INDEX "FmsNodeAccessGrant_tenant_id_department_master_id_revoked_a_idx" ON "FmsNodeAccessGrant"("tenant_id", "department_master_id", "revoked_at");

-- CreateIndex
CREATE INDEX "FmsDepartment_tenant_id_parent_id_is_active_idx" ON "FmsDepartment"("tenant_id", "parent_id", "is_active");

-- CreateIndex
CREATE INDEX "FmsDepartment_legacy_department_id_idx" ON "FmsDepartment"("legacy_department_id");

-- CreateIndex
CREATE UNIQUE INDEX "FmsDepartment_tenant_id_path_key_key" ON "FmsDepartment"("tenant_id", "path_key");

-- CreateIndex
CREATE UNIQUE INDEX "FmsDepartment_tenant_id_code_parent_id_key" ON "FmsDepartment"("tenant_id", "code", "parent_id");

-- CreateIndex
CREATE INDEX "FmsDepartmentBranch_tenant_id_branch_id_idx" ON "FmsDepartmentBranch"("tenant_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "FmsDepartmentBranch_department_master_id_branch_id_key" ON "FmsDepartmentBranch"("department_master_id", "branch_id");

-- CreateIndex
CREATE INDEX "FmsDocumentAccessGrant_document_id_grant_type_revoked_at_idx" ON "FmsDocumentAccessGrant"("document_id", "grant_type", "revoked_at");

-- CreateIndex
CREATE INDEX "FmsDocumentAccessGrant_user_id_revoked_at_idx" ON "FmsDocumentAccessGrant"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "FmsDocumentAccessGrant_branch_id_revoked_at_idx" ON "FmsDocumentAccessGrant"("branch_id", "revoked_at");

-- CreateIndex
CREATE INDEX "FmsAccessRequest_document_id_status_created_at_idx" ON "FmsAccessRequest"("document_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "FmsAccessRequest_owner_node_id_status_created_at_idx" ON "FmsAccessRequest"("owner_node_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "FmsAccessRequest_requester_user_id_created_at_idx" ON "FmsAccessRequest"("requester_user_id", "created_at");

-- CreateIndex
CREATE INDEX "FmsAuditLog_tenant_id_created_at_idx" ON "FmsAuditLog"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "FmsAuditLog_document_id_created_at_idx" ON "FmsAuditLog"("document_id", "created_at");

-- CreateIndex
CREATE INDEX "FmsAuditLog_request_id_created_at_idx" ON "FmsAuditLog"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "FmsAuditLog_owner_node_id_created_at_idx" ON "FmsAuditLog"("owner_node_id", "created_at");

-- CreateIndex
CREATE INDEX "FmsBranchAppendRequest_tenant_id_status_created_at_idx" ON "FmsBranchAppendRequest"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "FmsBranchAppendRequest_requester_branch_id_status_created_a_idx" ON "FmsBranchAppendRequest"("requester_branch_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "FmsBranchAppendRequest_source_branch_id_status_created_at_idx" ON "FmsBranchAppendRequest"("source_branch_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "FmsBranchAppendGrant_tenant_id_target_branch_id_revoked_at_idx" ON "FmsBranchAppendGrant"("tenant_id", "target_branch_id", "revoked_at");

-- CreateIndex
CREATE INDEX "FmsBranchAppendGrant_tenant_id_source_branch_id_revoked_at_idx" ON "FmsBranchAppendGrant"("tenant_id", "source_branch_id", "revoked_at");

-- CreateIndex
CREATE INDEX "FmsBranchAppendGrant_request_id_idx" ON "FmsBranchAppendGrant"("request_id");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "Vertical"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginOtpChallenge" ADD CONSTRAINT "LoginOtpChallenge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "Vertical"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_current_owner_user_id_fkey" FOREIGN KEY ("current_owner_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_next_responsible_user_id_fkey" FOREIGN KEY ("next_responsible_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_last_action_by_user_id_fkey" FOREIGN KEY ("last_action_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "Note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "Note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "Note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "Note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteAction" ADD CONSTRAINT "NoteAction_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "Note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteAction" ADD CONSTRAINT "NoteAction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteMovement" ADD CONSTRAINT "NoteMovement_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteMovement" ADD CONSTRAINT "NoteMovement_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteMovement" ADD CONSTRAINT "NoteMovement_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteMovement" ADD CONSTRAINT "NoteMovement_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteMovement" ADD CONSTRAINT "NoteMovement_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteMovement" ADD CONSTRAINT "NoteMovement_acted_by_user_id_fkey" FOREIGN KEY ("acted_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RejectionHighlight" ADD CONSTRAINT "RejectionHighlight_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "Note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RejectionHighlight" ADD CONSTRAINT "RejectionHighlight_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsNode" ADD CONSTRAINT "FmsNode_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsNode" ADD CONSTRAINT "FmsNode_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsNode" ADD CONSTRAINT "FmsNode_department_master_id_fkey" FOREIGN KEY ("department_master_id") REFERENCES "FmsDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsNode" ADD CONSTRAINT "FmsNode_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "FmsNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDocument" ADD CONSTRAINT "FmsDocument_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDocument" ADD CONSTRAINT "FmsDocument_owner_node_id_fkey" FOREIGN KEY ("owner_node_id") REFERENCES "FmsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDocument" ADD CONSTRAINT "FmsDocument_department_master_id_fkey" FOREIGN KEY ("department_master_id") REFERENCES "FmsDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDocument" ADD CONSTRAINT "FmsDocument_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDocument" ADD CONSTRAINT "FmsDocument_source_note_id_fkey" FOREIGN KEY ("source_note_id") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDocument" ADD CONSTRAINT "FmsDocument_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "FmsDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDocument" ADD CONSTRAINT "FmsDocument_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDocument" ADD CONSTRAINT "FmsDocument_published_by_user_id_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsNodeAccessGrant" ADD CONSTRAINT "FmsNodeAccessGrant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsNodeAccessGrant" ADD CONSTRAINT "FmsNodeAccessGrant_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "FmsNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsNodeAccessGrant" ADD CONSTRAINT "FmsNodeAccessGrant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsNodeAccessGrant" ADD CONSTRAINT "FmsNodeAccessGrant_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsNodeAccessGrant" ADD CONSTRAINT "FmsNodeAccessGrant_department_master_id_fkey" FOREIGN KEY ("department_master_id") REFERENCES "FmsDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsNodeAccessGrant" ADD CONSTRAINT "FmsNodeAccessGrant_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsNodeAccessGrant" ADD CONSTRAINT "FmsNodeAccessGrant_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDepartment" ADD CONSTRAINT "FmsDepartment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDepartment" ADD CONSTRAINT "FmsDepartment_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "FmsDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDepartment" ADD CONSTRAINT "FmsDepartment_legacy_department_id_fkey" FOREIGN KEY ("legacy_department_id") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDepartmentBranch" ADD CONSTRAINT "FmsDepartmentBranch_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDepartmentBranch" ADD CONSTRAINT "FmsDepartmentBranch_department_master_id_fkey" FOREIGN KEY ("department_master_id") REFERENCES "FmsDepartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDepartmentBranch" ADD CONSTRAINT "FmsDepartmentBranch_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDocumentAccessGrant" ADD CONSTRAINT "FmsDocumentAccessGrant_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "FmsDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDocumentAccessGrant" ADD CONSTRAINT "FmsDocumentAccessGrant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsDocumentAccessGrant" ADD CONSTRAINT "FmsDocumentAccessGrant_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsAccessRequest" ADD CONSTRAINT "FmsAccessRequest_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "FmsDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsAccessRequest" ADD CONSTRAINT "FmsAccessRequest_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsAccessRequest" ADD CONSTRAINT "FmsAccessRequest_requester_branch_id_fkey" FOREIGN KEY ("requester_branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsAccessRequest" ADD CONSTRAINT "FmsAccessRequest_owner_node_id_fkey" FOREIGN KEY ("owner_node_id") REFERENCES "FmsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsAccessRequest" ADD CONSTRAINT "FmsAccessRequest_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsAccessRequest" ADD CONSTRAINT "FmsAccessRequest_target_branch_id_fkey" FOREIGN KEY ("target_branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsAccessRequest" ADD CONSTRAINT "FmsAccessRequest_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsAuditLog" ADD CONSTRAINT "FmsAuditLog_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsAuditLog" ADD CONSTRAINT "FmsAuditLog_owner_node_id_fkey" FOREIGN KEY ("owner_node_id") REFERENCES "FmsNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsAuditLog" ADD CONSTRAINT "FmsAuditLog_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "FmsDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsAuditLog" ADD CONSTRAINT "FmsAuditLog_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "FmsAccessRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsAuditLog" ADD CONSTRAINT "FmsAuditLog_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsBranchAppendRequest" ADD CONSTRAINT "FmsBranchAppendRequest_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsBranchAppendRequest" ADD CONSTRAINT "FmsBranchAppendRequest_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsBranchAppendRequest" ADD CONSTRAINT "FmsBranchAppendRequest_requester_branch_id_fkey" FOREIGN KEY ("requester_branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsBranchAppendRequest" ADD CONSTRAINT "FmsBranchAppendRequest_source_branch_id_fkey" FOREIGN KEY ("source_branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsBranchAppendRequest" ADD CONSTRAINT "FmsBranchAppendRequest_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsBranchAppendGrant" ADD CONSTRAINT "FmsBranchAppendGrant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsBranchAppendGrant" ADD CONSTRAINT "FmsBranchAppendGrant_source_branch_id_fkey" FOREIGN KEY ("source_branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsBranchAppendGrant" ADD CONSTRAINT "FmsBranchAppendGrant_target_branch_id_fkey" FOREIGN KEY ("target_branch_id") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsBranchAppendGrant" ADD CONSTRAINT "FmsBranchAppendGrant_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "FmsBranchAppendRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsBranchAppendGrant" ADD CONSTRAINT "FmsBranchAppendGrant_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FmsBranchAppendGrant" ADD CONSTRAINT "FmsBranchAppendGrant_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

