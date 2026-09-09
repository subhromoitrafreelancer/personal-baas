import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { JobRunRow } from './scheduler.types';

@Injectable()
export class JobRunsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listByJob(jobId: string): Promise<JobRunRow[]> {
    const { rows } = await this.pool.query<JobRunRow>(
      'SELECT * FROM scheduler.job_runs WHERE job_id = $1 ORDER BY started_at DESC LIMIT 50',
      [jobId],
    );
    return rows;
  }

  // "A job whose previous run hasn't finished when its next scheduled time arrives is skipped
  // for that tick" (scope.md §27 point 5) — this is the query that check backs.
  async hasInFlight(jobId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'SELECT 1 FROM scheduler.job_runs WHERE job_id = $1 AND finished_at IS NULL LIMIT 1',
      [jobId],
    );
    return rows.length > 0;
  }

  async start(jobId: string): Promise<JobRunRow> {
    const { rows } = await this.pool.query<JobRunRow>(
      'INSERT INTO scheduler.job_runs (job_id) VALUES ($1) RETURNING *',
      [jobId],
    );
    return rows[0];
  }

  async finish(id: string, status: string, error: string | null): Promise<void> {
    await this.pool.query(
      'UPDATE scheduler.job_runs SET finished_at = now(), status = $2, error = $3 WHERE id = $1',
      [id, status, error],
    );
  }
}
