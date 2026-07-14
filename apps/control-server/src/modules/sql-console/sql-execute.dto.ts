import { z } from 'zod';

export const MAX_ROW_LIMIT = 5000;
export const DEFAULT_ROW_LIMIT = 500;

export const executeRequestSchema = z.object({
  sql: z.string().min(1, 'sql is required'),
  mode: z.enum(['statement', 'script']).default('statement'),
  rowLimit: z.coerce.number().int().positive().max(MAX_ROW_LIMIT).optional(),
  statementTimeoutMs: z.coerce.number().int().positive().optional(),
  // Client-generated id so a concurrent request can cancel this execution before it responds.
  executionId: z.string().uuid().optional(),
});

export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

export const cancelRequestSchema = z.object({
  executionId: z.string().uuid(),
});

export type CancelRequest = z.infer<typeof cancelRequestSchema>;

export interface StatementResult {
  text: string;
  rowCount: number | null;
  rows: Record<string, unknown>[];
  truncated: boolean;
  fields: string[];
  durationMs: number;
}

export interface SqlErrorDetails {
  message: string;
  line?: number;
  position?: number;
  statementIndex: number;
  sql: string;
}

export interface ExecuteResponse {
  mode: ExecuteRequest['mode'];
  statements: StatementResult[];
  totalDurationMs: number;
}

export interface ExecuteErrorResponse extends ExecuteResponse {
  error: SqlErrorDetails;
}
