export interface RecordSqlExecutionInput {
  adminId: string;
  adminEmail: string;
  mode: 'statement' | 'script';
  sql: string;
  success: boolean;
  errorMessage?: string;
  statementCount: number;
  durationMs: number;
}

export interface SqlHistoryEntry {
  id: string;
  adminEmail: string;
  mode: string;
  sql: string;
  success: boolean;
  errorMessage: string | null;
  statementCount: number;
  durationMs: number;
  executedAt: string;
}
