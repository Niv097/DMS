import { z } from 'zod';

export const createNoteSchema = z.object({
  subject: z.string().trim().min(2, 'Subject is required.'),
  note_type: z.string().trim().min(1, 'Note type is required.'),
  workflow_type: z.string().trim().optional().default('STRICT'),
  classification: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']).optional().default('INTERNAL'),
  vertical_id: z.union([z.string(), z.number()]),
  department_id: z.union([z.string(), z.number()]),
  comment_text: z.string().trim().min(1, 'Uploader comment is required when creating a file.')
});

export const submitNoteSchema = z.object({
  recommender_id: z.union([z.string(), z.number()]).optional(),
  approver_id: z.union([z.string(), z.number()]).optional(),
  recommenders: z.array(z.union([z.string(), z.number()])).optional(),
  approvers: z.array(z.union([z.string(), z.number()])).optional(),
  comment_text: z.string().trim().min(1, 'Comment is required when starting workflow.')
});

export const reuploadNoteSchema = z.object({
  comment_text: z.string().trim().min(1, 'Comment is required when creating a new version.')
});

export const workflowActionSchema = z.object({
  action_type: z.string().trim().min(1, 'Action type is required.'),
  comment: z.string().trim().min(1, 'Comment is required for this action.'),
  highlights: z.array(z.object({
    page_number: z.union([z.string(), z.number()]),
    x: z.union([z.string(), z.number()]),
    y: z.union([z.string(), z.number()]),
    width: z.union([z.string(), z.number()]),
    height: z.union([z.string(), z.number()])
  })).optional()
});

export const reassignWorkflowSchema = z.object({
  target_user_id: z.union([z.string(), z.number()]),
  reason: z.string().trim().min(1, 'Reason is required when reassigning workflow.')
});

export const noteAccessGrantSchema = z.object({
  granted_user_id: z.union([z.string(), z.number()]),
  access_level: z.enum(['VIEW', 'DOWNLOAD']).optional().default('VIEW'),
  remarks: z.string().trim().max(500, 'Remarks must be 500 characters or less.').optional().or(z.literal(''))
});

export const revokeNoteAccessGrantSchema = z.object({
  reason: z.string().trim().max(500, 'Reason must be 500 characters or less.').optional().or(z.literal(''))
});
