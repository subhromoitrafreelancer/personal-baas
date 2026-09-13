import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { PdfRenderRequestRow } from './pdf.types';

export interface RecordRenderRequestInput {
  projectId: string;
  status: 'success' | 'failed';
  durationMs: number | null;
  outputBytes: number | null;
  error: string | null;
}

@Injectable()
export class PdfRenderRequestsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async record(input: RecordRenderRequestInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO pdf.render_requests (project_id, status, duration_ms, output_bytes, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.projectId, input.status, input.durationMs, input.outputBytes, input.error],
    );
  }

  async listByProject(projectId: string, limit: number): Promise<PdfRenderRequestRow[]> {
    const { rows } = await this.pool.query<PdfRenderRequestRow>(
      `SELECT * FROM pdf.render_requests WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [projectId, limit],
    );
    return rows;
  }
}
