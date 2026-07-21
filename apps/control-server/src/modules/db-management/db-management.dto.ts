import { z } from 'zod';

export const deleteTableBodySchema = z.object({
  confirmName: z.string().min(1),
});
