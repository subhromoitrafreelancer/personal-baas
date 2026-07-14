import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { DatabaseError } from 'pg';
import { AdminIdentity } from '../admin-auth/admin.types';
import { AdminQueryService } from '../admin-db/admin-query.service';
import { DEFAULT_ROW_LIMIT, ExecuteRequest, ExecuteResponse, StatementResult } from './sql-execute.dto';
import { redactSensitiveSql } from './sql-redact.util';
import { locateInScript, splitSqlStatements } from './sql-split.util';

class SqlExecutionError extends Error {
  constructor(
    readonly details: { message: string; line?: number; position?: number; statementIndex: number; sql: string },
    readonly completed: StatementResult[],
  ) {
    super(details.message);
  }
}

@Injectable()
export class SqlConsoleService {
  private readonly logger = new Logger(SqlConsoleService.name);

  // Maps a client-supplied executionId to the backend pid running it, so a concurrent
  // POST /admin/v1/sql/cancel request (a separate HTTP connection) can abort it mid-flight.
  private readonly activeExecutions = new Map<string, number>();

  constructor(private readonly adminQuery: AdminQueryService) {}

  async execute(input: ExecuteRequest, admin: AdminIdentity): Promise<ExecuteResponse> {
    const spans =
      input.mode === 'script' ? splitSqlStatements(input.sql) : [{ text: input.sql, startOffset: 0 }];
    if (spans.length === 0) {
      throw new UnprocessableEntityException({
        mode: input.mode,
        statements: [],
        error: { message: 'No SQL statements found', statementIndex: 0, sql: input.sql },
        totalDurationMs: 0,
      });
    }

    const rowLimit = input.rowLimit ?? DEFAULT_ROW_LIMIT;
    const startedAt = Date.now();
    const completed: StatementResult[] = [];

    const { pid, result } = await this.adminQuery.withConnection(async (client) => {
      for (const span of spans) {
        const stmtStart = Date.now();
        try {
          const res = await client.query(span.text);
          completed.push({
            text: span.text.trim(),
            rowCount: res.rowCount,
            rows: res.rows.slice(0, rowLimit),
            truncated: res.rows.length > rowLimit,
            fields: res.fields?.map((f) => f.name) ?? [],
            durationMs: Date.now() - stmtStart,
          });
        } catch (err) {
          const pgErr = err as DatabaseError;
          const rawPosition = pgErr.position ? Number(pgErr.position) : undefined;
          const loc =
            rawPosition !== undefined
              ? locateInScript(input.sql, span.startOffset + rawPosition - 1)
              : undefined;
          throw new SqlExecutionError(
            {
              message: pgErr.message,
              line: loc?.line,
              position: loc?.column,
              statementIndex: completed.length,
              sql: span.text.trim(),
            },
            [...completed],
          );
        }
      }
      return completed;
    }, input.statementTimeoutMs);

    if (input.executionId) {
      this.activeExecutions.set(input.executionId, pid);
    }

    try {
      await result;
    } catch (err) {
      if (err instanceof SqlExecutionError) {
        this.logExecution(admin, input, false, Date.now() - startedAt, err.details.message);
        throw new UnprocessableEntityException({
          mode: input.mode,
          statements: err.completed,
          error: err.details,
          totalDurationMs: Date.now() - startedAt,
        });
      }
      throw err;
    } finally {
      if (input.executionId) {
        this.activeExecutions.delete(input.executionId);
      }
    }

    this.logExecution(admin, input, true, Date.now() - startedAt);
    return { mode: input.mode, statements: completed, totalDurationMs: Date.now() - startedAt };
  }

  async cancel(executionId: string): Promise<boolean> {
    const pid = this.activeExecutions.get(executionId);
    if (!pid) {
      return false;
    }
    return this.adminQuery.cancel(pid);
  }

  private logExecution(
    admin: AdminIdentity,
    input: ExecuteRequest,
    success: boolean,
    durationMs: number,
    errorMessage?: string,
  ) {
    this.logger.log({
      msg: 'admin sql execution',
      adminId: admin.sub,
      adminEmail: admin.email,
      mode: input.mode,
      success,
      durationMs,
      sql: redactSensitiveSql(input.sql),
      error: errorMessage,
    });
  }
}
