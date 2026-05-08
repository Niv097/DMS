import { z } from 'zod';

export const documentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});
