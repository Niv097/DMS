import { z } from 'zod';

export const noteCreateSchema = z.object({
  subject: z.string().min(5),
  vertical: z.string(),
  originatingDepartment: z.string(),
  noteType: z.enum(['Financial', 'Non Financial', 'Note for Information']),
  workflowType: z.enum(['Normal', 'Group']),
  recommenders: z.array(z.union([z.number(), z.string().transform(Number)])).length(2),
  approvers: z.array(z.union([z.number(), z.string().transform(Number)])).length(2),
  controller: z.union([z.number(), z.string().transform(Number)])
});

export const workflowActionSchema = z.object({
  action: z.enum(['RECOMMEND', 'APPROVE', 'REFER BACK', 'COMMENT']),
  comment: z.string().min(1)
});
