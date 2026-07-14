import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { RecordSqlExecutionInput, SqlHistoryEntry } from './sql-history.types';

interface HistoryRow {
  id: string;
  admin_email: string;
  mode: string;
  sql: string;
  success: boolean;
  error_message: string | null;
  statement_count: number;
  duration_ms: number;
  executed_at: string;
}

function toEntry(row: HistoryRow): SqlHistoryEntry {
  return {
    id: row.id,
    adminEmail: row.admin_email,
    mode: row.mode,
    sql: row.sql,
    success: row.success,
    errorMessage: row.error_message,
    statementCount: row.statement_count,
    durationMs: row.duration_ms,
    executedAt: row.executed_at,
  };
}

@Injectable()
export class SqlHistoryService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async record(input: RecordSqlExecutionInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO platform.admin_sql_history
        (admin_id, admin_email, mode, sql, success, error_message, statement_count, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.adminId,
        input.adminEmail,
        input.mode,
        input.sql,
        input.success,
        input.errorMessage ?? null,
        input.statementCount,
        input.durationMs,
      ],
    );
  }

  async list(limit: number, offset: number): Promise<{ items: SqlHistoryEntry[]; total: number }> {
    const [{ rows }, {
      rows: [{ count }],
    }] = await Promise.all([
      this.pool.query<HistoryRow>(
        `SELECT id, admin_email, mode, sql, success, error_message, statement_count, duration_ms, executed_at
         FROM platform.admin_sql_history
         ORDER BY executed_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      this.pool.query<{ count: number }>('SELECT count(*)::int AS count FROM platform.admin_sql_history'),
    ]);

    return { items: rows.map(toEntry), total: count };
  }
}
