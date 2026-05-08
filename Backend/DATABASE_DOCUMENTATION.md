# Database Documentation

## 1. Overview

- Application: `DMS`
- Database engine: `PostgreSQL`
- ORM/schema layer: `Prisma`
- Active schema source:
  - `Backend/schema.prisma`
  - `Backend/prisma/schema.prisma`
- Enterprise scope covered by current schema:
  - Multi-bank tenancy
  - Branch-aware access
  - Role-based workflow
  - Version-controlled note management
  - Main and supporting files
  - Audit logging
  - Rejection markup storage
  - Real-time notification support

## 2. Database Purpose

This database supports a banking-oriented Document Management System where:

- one deployment can serve multiple banks
- each bank is treated as a `tenant`
- each bank can have multiple `branches`
- users are mapped to roles, tenant, branch, department, and vertical
- documents move through uploader -> recommender -> approver workflow
- only the main file is approval-sensitive
- supporting files remain reference documents
- every workflow action is auditable

## 3. Core Business Domains

### 3.1 Tenant and Branch Domain

- `Tenant`: bank-level master record
- `Branch`: branch under a tenant
- `UserBranchAccess`: optional many-branch access mapping for higher-role users

### 3.2 Identity and Access Domain

- `User`: system user
- `Role`: user role master
- `Department`: department master
- `Vertical`: vertical/business segment master

### 3.3 Document and Workflow Domain

- `Note`: main business document record
- `WorkflowStep`: routing and approval chain for a note
- `Attachment`: uploaded file record tied to a note
- `Comment`: business comments on note workflow
- `NoteAction`: action history by user on note
- `RejectionHighlight`: visual markups for rejection feedback

### 3.4 Audit and Notification Domain

- `AuditLog`: immutable audit-style event log
- `Notification`: in-app real-time notification records

## 4. Table-by-Table Data Dictionary

### 4.1 `Role`

Purpose:
- Defines allowed business roles.

Columns:
- `id` `Int` PK
- `name` `String` unique

Typical values:
- `INITIATOR`
- `RECOMMENDER`
- `APPROVER`
- `CONTROLLER`
- `ADMIN`
- `SUPER_ADMIN`
- `AUDITOR`

Relations:
- one role to many users

### 4.2 `Tenant`

Purpose:
- Represents one bank/client in the multi-tenant platform.

Columns:
- `id` `Int` PK
- `tenant_name` `String`
- `tenant_code` `String` unique
- `created_at` `DateTime`

Relations:
- one tenant to many branches
- one tenant to many users
- one tenant to many notes
- one tenant to many audit logs
- one tenant to many notifications

Example:
- `HDFC Bank`
- `State Bank of India`

### 4.3 `Branch`

Purpose:
- Represents one branch under a bank/tenant.

Columns:
- `id` `Int` PK
- `branch_name` `String`
- `branch_code` `String`
- `tenant_id` `Int` FK -> `Tenant.id`
- `created_at` `DateTime`

Unique rule:
- `tenant_id + branch_code`

Relations:
- one branch belongs to one tenant
- one branch to many users
- one branch to many notes
- one branch to many audit logs
- one branch to many notifications

### 4.4 `UserBranchAccess`

Purpose:
- Supports users who can access more than one branch.

Columns:
- `id` `Int` PK
- `user_id` `Int` FK -> `User.id`
- `branch_id` `Int` FK -> `Branch.id`
- `created_at` `DateTime`

Unique rule:
- `user_id + branch_id`

### 4.5 `Department`

Purpose:
- Department master used in user and note classification.

Columns:
- `id` `Int` PK
- `name` `String` unique

Relations:
- one department to many users
- one department to many notes

### 4.6 `Vertical`

Purpose:
- Vertical/business classification master.

Columns:
- `id` `Int` PK
- `name` `String` unique

Relations:
- one vertical to many users
- one vertical to many notes

### 4.7 `User`

Purpose:
- Stores login identity, role mapping, tenant/branch mapping, and account status.

Columns:
- `id` `Int` PK
- `user_id` `String?` unique
- `name` `String`
- `username` `String?` unique
- `email` `String` unique
- `password_hash` `String`
- `role_id` `Int` FK -> `Role.id`
- `tenant_id` `Int?` FK -> `Tenant.id`
- `branch_id` `Int?` FK -> `Branch.id`
- `department_id` `Int?` FK -> `Department.id`
- `vertical_id` `Int?` FK -> `Vertical.id`
- `is_active` `Boolean`
- `is_first_login` `Boolean`
- `accessible_branch_ids` `Json?`
- `created_at` `DateTime`

Relations:
- role
- tenant
- branch
- department
- vertical
- branch access rows
- initiated notes
- assigned workflow steps
- comments
- note actions
- rejection highlights created by user
- notifications

Operational notes:
- `is_first_login = true` forces password change on first login
- `is_active = false` blocks access
- `password_hash` stores bcrypt hash, never plain text

### 4.8 `Note`

Purpose:
- Master record for a document workflow item.

Columns:
- `id` `Int` PK
- `note_id` `String` unique
- `document_code` `String?` unique
- `document_group_key` `String`
- `version_number` `Int`
- `previous_version_id` `Int?` self FK
- `is_latest_version` `Boolean`
- `subject` `String`
- `note_type` `String`
- `workflow_type` `String`
- `initiator_id` `Int` FK -> `User.id`
- `tenant_id` `Int?` FK -> `Tenant.id`
- `branch_id` `Int?` FK -> `Branch.id`
- `department_id` `Int` FK -> `Department.id`
- `vertical_id` `Int` FK -> `Vertical.id`
- `status` `String`
- `approved_file_name` `String?`
- `approved_file_path` `String?`
- `approved_file_mime` `String?`
- `approved_at` `DateTime?`
- `approved_by_name` `String?`
- `approved_by_role` `String?`
- `approval_note` `String?`
- `archived_at` `DateTime?`
- `created_at` `DateTime`
- `updated_at` `DateTime`

Relations:
- initiator
- tenant
- branch
- department
- vertical
- self-version chain
- workflow steps
- attachments
- comments
- audit logs
- note actions
- rejection highlights

Important business rules:
- one document group can have multiple versions
- only one version should remain active/latest at a time
- approved artifact metadata is stored on the note

### 4.9 `WorkflowStep`

Purpose:
- Stores approval chain sequence for each note.

Columns:
- `id` `Int` PK
- `note_id` `Int` FK -> `Note.id`
- `sequence` `Int`
- `role_type` `String`
- `assigned_user_id` `Int?` FK -> `User.id`
- `status` `String`
- `action_date` `DateTime?`

Typical statuses:
- `PENDING`
- `COMPLETED`
- `REJECTED`
- `REFERRED_BACK`

Typical role types:
- `RECOMMENDER`
- `APPROVER`
- `CONTROLLER`

### 4.10 `Attachment`

Purpose:
- Stores uploaded files linked to a note.

Columns:
- `id` `Int` PK
- `note_id` `Int` FK -> `Note.id`
- `file_name` `String`
- `file_path` `String`
- `file_type` `String`
- `uploaded_at` `DateTime`

Business rule:
- `file_type` can be:
  - `MAIN`
  - `SUPPORTING`

Important:
- workflow applies only to the note/main artifact logic
- supporting files remain reference material

### 4.11 `Comment`

Purpose:
- Stores user comments on a note during workflow.

Columns:
- `id` `Int` PK
- `note_id` `Int` FK -> `Note.id`
- `user_id` `Int` FK -> `User.id`
- `comment_text` `Text`
- `created_at` `DateTime`

### 4.12 `AuditLog`

Purpose:
- Stores audit trail records for note events.

Columns:
- `id` `Int` PK
- `note_id` `Int` FK -> `Note.id`
- `tenant_id` `Int?` FK -> `Tenant.id`
- `branch_id` `Int?` FK -> `Branch.id`
- `version_number` `Int?`
- `attachment_id` `Int?` FK -> `Attachment.id`
- `file_type` `String?`
- `file_name` `String?`
- `action` `String`
- `performed_by` `String`
- `role` `String`
- `remarks` `Text?`
- `timestamp` `DateTime`

Typical actions:
- `UPLOAD`
- `VERSION_CREATED`
- `RECOMMEND`
- `REJECT`
- `APPROVE`
- `RESET_PASSWORD`
- onboarding/admin actions as applicable

Important:
- audit log is meant to be append-only
- includes multi-tenant and branch dimensions

### 4.13 `NoteAction`

Purpose:
- Lightweight operational action history tied to note and user.

Columns:
- `id` `Int` PK
- `note_id` `Int` FK -> `Note.id`
- `user_id` `Int` FK -> `User.id`
- `action_type` `String`
- `comment` `Text?`
- `timestamp` `DateTime`

### 4.14 `RejectionHighlight`

Purpose:
- Stores page coordinates for rejection annotations/highlights.

Columns:
- `id` `Int` PK
- `note_id` `Int` FK -> `Note.id`
- `document_group_key` `String`
- `version_number` `Int`
- `page_number` `Int`
- `x` `Float`
- `y` `Float`
- `width` `Float`
- `height` `Float`
- `created_by_user_id` `Int` FK -> `User.id`
- `created_at` `DateTime`

Use case:
- allows visual rejection marking on document pages

### 4.15 `Notification`

Purpose:
- Stores in-app alerts for workflow and admin events.

Columns:
- `id` `Int` PK
- `user_id` `Int` FK -> `User.id`
- `tenant_id` `Int?` FK -> `Tenant.id`
- `branch_id` `Int?` FK -> `Branch.id`
- `title` `String`
- `message` `Text`
- `category` `String`
- `entity_type` `String?`
- `entity_id` `Int?`
- `is_read` `Boolean`
- `created_at` `DateTime`

Typical categories:
- `GENERAL`
- `WORKFLOW`
- `APPROVAL`
- `ADMIN`

## 5. Main Relationships

- `Role 1 -> many User`
- `Tenant 1 -> many Branch`
- `Tenant 1 -> many User`
- `Tenant 1 -> many Note`
- `Branch 1 -> many User`
- `Branch 1 -> many Note`
- `User many -> many Branch` through `UserBranchAccess`
- `User 1 -> many initiated Note`
- `Note 1 -> many WorkflowStep`
- `Note 1 -> many Attachment`
- `Note 1 -> many Comment`
- `Note 1 -> many AuditLog`
- `Note 1 -> many NoteAction`
- `Note 1 -> many RejectionHighlight`
- `Note self-reference` for version chain
- `User 1 -> many Notification`

## 6. Status and Control Fields

### 6.1 Note Status

Current supported note statuses:
- `UPLOADED`
- `REJECTED`
- `RECOMMENDED`
- `FINAL_APPROVED`
- `SUPERSEDED`
- `ARCHIVED`

### 6.2 Attachment File Type

- `MAIN`
- `SUPPORTING`

### 6.3 User State

- `is_active`
- `is_first_login`

## 7. Versioning Design

Versioning is centered on the `Note` table:

- `document_group_key` groups all versions of the same business document
- `version_number` stores the version sequence
- `previous_version_id` chains the note to its prior version
- `is_latest_version` marks the latest active version

Expected lifecycle:
- `v1` created
- new upload creates `v2`
- older version remains stored
- latest approved version becomes authoritative
- older versions may become `ARCHIVED` or `SUPERSEDED` depending on business flow

## 8. Multi-Tenant and Branch Isolation

Isolation dimensions:
- `tenant_id`
- `branch_id`

Applied on:
- users
- notes
- audit logs
- notifications

Access model:
- same application URL for all banks
- each bank is one tenant
- each bank can have many branches
- users see only allowed tenant/branch data
- advanced users can get multi-branch access using `UserBranchAccess`

## 9. Document Code and Identifier Strategy

Two identifiers exist at note level:

- `note_id`
  - legacy/business-facing note identifier
  - example: `NT/NFIN/2026/0001`

- `document_code`
  - enterprise multi-bank code
  - intended format: `DOC/<TENANT_CODE>/<BRANCH_CODE>/<YEAR>/<SEQUENCE>`
  - example: `DOC/HDFC/AHD/2026/000123`

## 10. Audit and Compliance Notes

The schema supports banking-grade auditability through:

- workflow step history
- comments
- note actions
- audit logs
- user and branch attribution
- version tracking
- rejection page coordinates
- notification traceability

Best practice:
- do not delete audit data in production
- restrict destructive cleanup to demo/admin-only utilities

## 11. Important Indexes and Constraints

### Unique Constraints

- `Role.name`
- `Tenant.tenant_code`
- `Tenant.tenant_name + tenant_code`
- `Branch.tenant_id + branch_code`
- `User.user_id`
- `User.username`
- `User.email`
- `UserBranchAccess.user_id + branch_id`
- `Department.name`
- `Vertical.name`
- `Note.note_id`
- `Note.document_code`

### Main Indexes

- `Note(document_group_key, version_number)`
- `Note(document_group_key, is_latest_version)`
- `Note(status, is_latest_version)`
- `Note(tenant_id, branch_id, status)`
- `Attachment(note_id, file_type)`
- `AuditLog(note_id, file_type)`
- `AuditLog(attachment_id)`
- `AuditLog(tenant_id, branch_id, timestamp)`
- `RejectionHighlight(note_id, page_number)`
- `RejectionHighlight(document_group_key, version_number)`
- `Notification(user_id, is_read, created_at)`
- `Notification(tenant_id, branch_id, created_at)`

## 12. Current Migration Reference

Main enterprise migration file:
- `Backend/prisma/migrations/20260420090000_multi_tenant_enterprise_extension/migration.sql`

This migration introduces:
- `Tenant`
- `Branch`
- `UserBranchAccess`
- enterprise user columns
- enterprise note columns
- audit tenant/branch/version columns
- default tenant and branch backfill
- unique indexes for username, user code, document code
- `SUPER_ADMIN` role bootstrap

## 13. Delivery Notes for Banks

For bank delivery:

- onboard each bank as a `Tenant`
- onboard each branch as a `Branch`
- create bank admin users under that tenant
- use first-login password enforcement
- keep tenant isolation enabled
- avoid using demo cleanup or destructive admin utilities in production
- prefer migration-driven deployment, not ad hoc schema push

## 14. Source References

Primary schema:
- `Backend/schema.prisma`
- `Backend/prisma/schema.prisma`

Migration:
- `Backend/prisma/migrations/20260420090000_multi_tenant_enterprise_extension/migration.sql`

Useful implementation references:
- `Backend/src/routes/auth.js`
- `Backend/src/controllers/admin.js`
- `Backend/src/controllers/notes.js`
- `Backend/src/services/notificationService.js`


