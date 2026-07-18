import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { FunctionInvocationRow } from './functions.types';

@Injectable()
export class FunctionInvocationsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async record(params: {
    functionId: string;
    status: string;
    durationMs: number;
    error: string | null;
  }): Promise<FunctionInvocationRow> {
    const { rows } = await this.pool.query<FunctionInvocationRow>(
      `INSERT INTO functions.invocations (function_id, status, duration_ms, error)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [params.functionId, params.status, params.durationMs, params.error],
    );
    return rows[0];
  }

  async listByFunction(functionId: string, limit = 50): Promise<FunctionInvocationRow[]> {
    const { rows } = await this.pool.query<FunctionInvocationRow>(
      'SELECT * FROM functions.invocations WHERE function_id = $1 ORDER BY invoked_at DESC LIMIT $2',
      [functionId, limit],
    );
    return rows;
  }
}
