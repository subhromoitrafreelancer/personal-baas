import { z } from 'zod';

export const deleteTableBodySchema = z.object({
  confirmName: z.string().min(1),
});

// Both may be empty strings — an empty summary+description together means "clear the comment"
// (scope.md §37 point 4), not "set it to an empty string".
export const updateCommentBodySchema = z.object({
  summary: z.string().max(500),
  description: z.string().max(4000),
});
