import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import { EnvConfig } from '../../config/env.schema';
import { ADMIN_QUERY_POOL } from './admin-db.constants';

export interface AdminQueryHandle<T extends QueryResultRow = QueryResultRow> {
  /** Backend process id of the connection running this query — pass to cancel() to abort it. */
  pid: number;
  result: Promise<QueryResult<T>>;
}

@Injectable()
export class AdminQueryService {
  constructor(
    @Inject(ADMIN_QUERY_POOL) private readonly pool: Pool,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * Runs a single admin-issued SQL statement on its own connection with a statement_timeout
   * applied. The connection is released back to the pool once the query settles (success,
   * error, or cancellation) — never left holding a SET statement_timeout for the next borrower.
   */
  async runQuery<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
    statementTimeoutMs = this.config.get('ADMIN_SQL_STATEMENT_TIMEOUT_MS', { infer: true }),
  ): Promise<AdminQueryHandle<T>> {
    if (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs <= 0) {
      throw new Error('statementTimeoutMs must be a positive integer');
    }

    const client = await this.pool.connect();
    const {
      rows: [{ pid }],
    } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    // statement_timeout takes no bind parameters; the value is validated above, not user SQL.
    await client.query(`SET statement_timeout = ${statementTimeoutMs}`);

    const result = client.query<T>(sql, params).finally(() => client.release());

    return { pid, result };
  }

  /** Cancels an in-flight query by backend pid (scope.md §5.2: "Cancel long-running queries"). */
  async cancel(pid: number): Promise<boolean> {
    const {
      rows: [{ pg_cancel_backend: cancelled }],
    } = await this.pool.query<{ pg_cancel_backend: boolean }>('SELECT pg_cancel_backend($1)', [
      pid,
    ]);
    return cancelled;
  }

  /** Simple non-cancellable read, e.g. catalog metadata queries for the database explorer. */
  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }
}
