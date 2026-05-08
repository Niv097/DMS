import { z } from 'zod';
import { DOCUMENT_CLASSIFICATIONS, FMS_PERMISSIONS } from '../services/fmsService.js';

const idValue = z.union([z.string(), z.number()]);

export const createFmsNodeSchema = z.object({
  tenant_id: idValue,
  branch_id: idValue.optional(),
  department_master_id: idValue.optional(),
  parent_id: idValue.optional(),
  name: z.string().trim().min(2, 'Node name is required.'),
  code: z.string().trim().min(2, 'Node code is required.'),
  node_type: z.enum(['HO', 'DEPARTMENT', 'SUB_DEPARTMENT', 'BANK', 'MEDIA_FOLDER'])
});

export const createFmsDepartmentSchema = z.object({
  tenant_id: idValue,
  parent_department_id: idValue.optional(),
  legacy_department_id: idValue.optional(),
  name: z.string().trim().min(2, 'Department name is required.'),
  code: z.string().trim().min(2, 'Department code is required.'),
  branch_ids: z.array(idValue).optional()
});

export const updateFmsDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Department name is required.').optional(),
  code: z.string().trim().min(2, 'Department code is required.').optional(),
  legacy_department_id: idValue.optional(),
  branch_ids: z.array(idValue).optional(),
  is_active: z.boolean().optional()
});

export const updateFmsLibraryStandardsSchema = z.object({
  tenant_id: idValue.optional(),
  classification_master: z.array(z.object({
    value: z.enum(DOCUMENT_CLASSIFICATIONS),
    label: z.string().trim().min(2, 'Classification label is required.')
  })).optional(),
  record_type_master: z.array(z.object({
    value: z.string().trim().min(2, 'Record type code is required.'),
    label: z.string().trim().min(2, 'Record type label is required.'),
    department_codes: z.array(z.string().trim().min(1)).optional(),
    default_desk: z.string().trim().optional(),
    required_fields: z.array(z.string().trim().min(1)).optional(),
    visible_fields: z.array(z.string().trim().min(1)).optional(),
    field_labels: z.record(z.string(), z.string()).optional()
  })).optional(),
  record_desk_master: z.array(z.string().trim().min(2, 'Desk name is required.')).optional()
});

export const fmsUploadSchema = z.object({
  owner_node_id: idValue,
  base_document_id: idValue.optional(),
  classification: z.enum(DOCUMENT_CLASSIFICATIONS),
  visibility_mode: z.enum(['ACTIVE', 'BACKUP_ONLY']).optional(),
  document_type: z.string().trim().min(2, 'Document type is required.'),
  title: z.string().trim().min(2, 'Title is required.'),
  customer_name: z.string().trim().optional(),
  customer_reference: z.string().trim().optional(),
  cif_reference: z.string().trim().optional(),
  account_reference: z.string().trim().optional(),
  identity_reference: z.string().trim().optional(),
  id_proof_number: z.string().trim().optional(),
  document_reference: z.string().trim().optional(),
  document_category: z.string().trim().optional(),
  tags: z.union([z.string(), z.array(z.string().trim())]).optional(),
  custom_index_json: z.record(z.string(), z.string()).optional(),
  access_scope: z.enum(['NODE_ONLY', 'REQUEST_BASED']).optional(),
  notes: z.string().trim().optional()
});

export const fmsPublishNoteSchema = z.object({
  owner_node_id: idValue,
  attachment_id: idValue.optional(),
  classification: z.enum(DOCUMENT_CLASSIFICATIONS),
  visibility_mode: z.enum(['ACTIVE', 'BACKUP_ONLY']).optional(),
  document_type: z.string().trim().min(2, 'Document type is required.'),
  title: z.string().trim().min(2, 'Title is required.'),
  customer_name: z.string().trim().optional(),
  customer_reference: z.string().trim().optional(),
  cif_reference: z.string().trim().optional(),
  account_reference: z.string().trim().optional(),
  identity_reference: z.string().trim().optional(),
  id_proof_number: z.string().trim().optional(),
  document_reference: z.string().trim().optional(),
  document_category: z.string().trim().optional(),
  tags: z.union([z.string(), z.array(z.string().trim())]).optional(),
  custom_index_json: z.record(z.string(), z.string()).optional(),
  notes: z.string().trim().optional()
});

export const fmsAccessRequestSchema = z.object({
  target_type: z.enum(['USER', 'BRANCH']),
  access_level: z.enum(['VIEW', 'DOWNLOAD']).optional(),
  target_user_id: idValue.optional(),
  target_branch_id: idValue.optional(),
  reason: z.string().trim().min(5, 'Reason is required.'),
  expires_at: z.string().trim().optional()
}).superRefine((payload, ctx) => {
  if (payload.target_type === 'USER' && !payload.target_user_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['target_user_id'], message: 'Target user is required.' });
  }
  if (payload.target_type === 'BRANCH' && !payload.target_branch_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['target_branch_id'], message: 'Target branch is required.' });
  }
});

export const fmsAccessDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  decision_note: z.string().trim().optional(),
  expires_at: z.string().trim().optional()
});

export const fmsGrantSchema = z.object({
  grant_type: z.enum(['USER', 'BRANCH']),
  access_level: z.enum(['VIEW', 'DOWNLOAD']).optional(),
  user_id: idValue.optional(),
  branch_id: idValue.optional(),
  expires_at: z.string().trim().optional()
}).superRefine((payload, ctx) => {
  if (payload.grant_type === 'USER' && !payload.user_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['user_id'], message: 'User is required.' });
  }
  if (payload.grant_type === 'BRANCH' && !payload.branch_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['branch_id'], message: 'Branch is required.' });
  }
});

export const fmsNodeGrantSchema = z.object({
  grant_type: z.enum(['USER', 'BRANCH', 'DEPARTMENT', 'GLOBAL']),
  access_level: z.enum(['VIEW', 'DOWNLOAD']).optional(),
  include_descendants: z.boolean().optional(),
  user_id: idValue.optional(),
  branch_id: idValue.optional(),
  department_master_id: idValue.optional(),
  expires_at: z.string().trim().optional()
}).superRefine((payload, ctx) => {
  if (payload.grant_type === 'USER' && !payload.user_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['user_id'], message: 'User is required.' });
  }
  if (payload.grant_type === 'BRANCH' && !payload.branch_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['branch_id'], message: 'Branch is required.' });
  }
  if (payload.grant_type === 'DEPARTMENT' && !payload.department_master_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['department_master_id'], message: 'Department is required.' });
  }
});

export const fmsNodeGrantRevokeSchema = z.object({
  revoke_reason: z.string().trim().min(5, 'Revoke reason is required.')
});

export const fmsRevokeGrantSchema = z.object({
  revoke_reason: z.string().trim().optional()
});

export const fmsBranchAppendRequestSchema = z.object({
  source_branch_id: idValue,
  reason: z.string().trim().min(8, 'Business reason is required.').max(500, 'Reason is too long.'),
  expires_at: z.string().trim().optional()
});

export const fmsBranchAppendDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  decision_note: z.string().trim().optional(),
  expires_at: z.string().trim().optional()
});

export const fmsBranchAppendGrantUpdateSchema = z.object({
  access_level: z.enum(['VIEW', 'DOWNLOAD']),
  expires_at: z.string().trim().optional()
});

export const fmsBranchAppendGrantRevokeSchema = z.object({
  revoke_reason: z.string().trim().min(5, 'Revoke reason is required.')
});

export const fmsDistributionSchema = z.object({
  target_type: z.enum(['USER', 'BRANCH', 'DEPARTMENT', 'BANK_WIDE']),
  access_level: z.enum(['VIEW', 'DOWNLOAD']).optional(),
  target_user_id: idValue.optional(),
  target_branch_id: idValue.optional(),
  target_department_master_id: idValue.optional(),
  title: z.string().trim().min(3, 'Distribution title is required.'),
  instruction_type: z.enum(['INFORMATION', 'ACTION', 'ACKNOWLEDGEMENT']).optional(),
  message: z.string().trim().min(5, 'Instruction message is required.'),
  due_at: z.string().trim().optional(),
  allow_redistribution: z.boolean().optional(),
  parent_distribution_id: idValue.optional(),
  source_recipient_id: idValue.optional()
}).superRefine((payload, ctx) => {
  if (payload.target_type === 'USER' && !payload.target_user_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['target_user_id'], message: 'Target user is required.' });
  }
  if (payload.target_type === 'BRANCH' && !payload.target_branch_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['target_branch_id'], message: 'Target branch is required.' });
  }
  if (payload.target_type === 'DEPARTMENT' && !payload.target_department_master_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['target_department_master_id'], message: 'Target department is required.' });
  }
});

export const fmsDistributionRecipientActionSchema = z.object({
  note: z.string().trim().optional()
});

export const updateUserFmsAccessSchema = z.object({
  fms_enabled: z.boolean(),
  fms_permissions: z.array(z.enum([
    FMS_PERMISSIONS.VIEW,
    FMS_PERMISSIONS.UPLOAD,
    FMS_PERMISSIONS.SHARE,
    FMS_PERMISSIONS.REVOKE,
    FMS_PERMISSIONS.PUBLISH
  ])).optional()
});
