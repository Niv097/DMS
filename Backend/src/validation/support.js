import { z } from 'zod';

export const supportMobileDeliverySchema = z.object({
  to: z.string().trim().min(8, 'Mobile number is required.'),
  subject: z.string().trim().min(3, 'Subject is required.').max(160, 'Subject is too long.'),
  message: z.string().trim().min(3, 'Message is required.').max(2000, 'Message is too long.'),
  metadata: z.record(z.any()).optional(),
  payload: z.record(z.any()).optional()
});
