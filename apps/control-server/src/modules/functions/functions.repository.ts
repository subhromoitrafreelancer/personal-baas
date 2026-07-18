import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { FunctionRow } from './functions.types';

@Injectable()
export class FunctionsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(projectId: string): Promise<FunctionRow[]> {
    const { rows } = await this.pool.query<FunctionRow>(
      'SELECT * FROM functions.functions WHERE project_id = $1 ORDER BY name',
      [projectId],
    );
    return rows;
  }

  // Scoped to (projectId, name), never name alone — the actual cross-project invocation
  // isolation boundary (scope.md §26 point 7a). A project-B JWT asking for a project-A
  // function's name finds no row here, full stop.
  async findByProjectAndName(projectId: string, name: string): Promise<FunctionRow | null> {
    const { rows } = await this.pool.query<FunctionRow>(
      'SELECT * FROM functions.functions WHERE project_id = $1 AND name = $2',
      [projectId, name],
    );
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<FunctionRow | null> {
    const { rows } = await this.pool.query<FunctionRow>(
      'SELECT * FROM functions.functions WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  }

  async create(projectId: string, name: string, code: string, timeoutMs: number): Promise<FunctionRow> {
    const { rows } = await this.pool.query<FunctionRow>(
      `INSERT INTO functions.functions (project_id, name, code, timeout_ms)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [projectId, name, code, timeoutMs],
    );
    return rows[0];
  }

  async update(id: string, patch: { code?: string; timeoutMs?: number }): Promise<FunctionRow | null> {
    const { rows } = await this.pool.query<FunctionRow>(
      `UPDATE functions.functions
       SET code = COALESCE($2, code),
           timeout_ms = COALESCE($3, timeout_ms),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, patch.code ?? null, patch.timeoutMs ?? null],
    );
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<FunctionRow | null> {
    const { rows } = await this.pool.query<FunctionRow>(
      'DELETE FROM functions.functions WHERE id = $1 RETURNING *',
      [id],
    );
    return rows[0] ?? null;
  }
}
