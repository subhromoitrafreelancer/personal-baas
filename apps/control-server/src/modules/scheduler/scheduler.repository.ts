import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { ScheduledJobRow } from './scheduler.types';

@Injectable()
export class SchedulerRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(projectId: string): Promise<ScheduledJobRow[]> {
    const { rows } = await this.pool.query<ScheduledJobRow>(
      'SELECT * FROM scheduler.scheduled_jobs WHERE project_id = $1 ORDER BY name',
      [projectId],
    );
    return rows;
  }

  async findById(id: string): Promise<ScheduledJobRow | null> {
    const { rows } = await this.pool.query<ScheduledJobRow>(
      'SELECT * FROM scheduler.scheduled_jobs WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  }

  async findByProjectAndName(projectId: string, name: string): Promise<ScheduledJobRow | null> {
    const { rows } = await this.pool.query<ScheduledJobRow>(
      'SELECT * FROM scheduler.scheduled_jobs WHERE project_id = $1 AND name = $2',
      [projectId, name],
    );
    return rows[0] ?? null;
  }

  async create(
    projectId: string,
    name: string,
    functionId: string,
    cronExpression: string,
    enabled: boolean,
    nextRunAt: Date,
  ): Promise<ScheduledJobRow> {
    const { rows } = await this.pool.query<ScheduledJobRow>(
      `INSERT INTO scheduler.scheduled_jobs (project_id, name, function_id, cron_expression, enabled, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [projectId, name, functionId, cronExpression, enabled, nextRunAt],
    );
    return rows[0];
  }

  async update(
    id: string,
    patch: {
      functionId?: string;
      cronExpression?: string;
      enabled?: boolean;
      nextRunAt?: Date | null;
    },
  ): Promise<ScheduledJobRow | null> {
    const { rows } = await this.pool.query<ScheduledJobRow>(
      `UPDATE scheduler.scheduled_jobs
       SET function_id = COALESCE($2, function_id),
           cron_expression = COALESCE($3, cron_expression),
           enabled = COALESCE($4, enabled),
           next_run_at = CASE WHEN $5 THEN $6 ELSE next_run_at END,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        patch.functionId ?? null,
        patch.cronExpression ?? null,
        patch.enabled ?? null,
        patch.nextRunAt !== undefined,
        patch.nextRunAt ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<ScheduledJobRow | null> {
    const { rows } = await this.pool.query<ScheduledJobRow>(
      'DELETE FROM scheduler.scheduled_jobs WHERE id = $1 RETURNING *',
      [id],
    );
    return rows[0] ?? null;
  }

  // The timer's own driving query: every job due to fire, across every project — the whole
  // point of a single in-process timer loop is that it isn't project-scoped.
  async findDue(now: Date): Promise<ScheduledJobRow[]> {
    const { rows } = await this.pool.query<ScheduledJobRow>(
      'SELECT * FROM scheduler.scheduled_jobs WHERE enabled = true AND next_run_at <= $1',
      [now],
    );
    return rows;
  }

  // The soonest upcoming enabled job, across every project — determines how long the timer's
  // single setTimeout should sleep for next.
  async findSoonestEnabled(): Promise<ScheduledJobRow | null> {
    const { rows } = await this.pool.query<ScheduledJobRow>(
      `SELECT * FROM scheduler.scheduled_jobs
       WHERE enabled = true AND next_run_at IS NOT NULL
       ORDER BY next_run_at ASC
       LIMIT 1`,
    );
    return rows[0] ?? null;
  }

  async recordRunResult(id: string, nextRunAt: Date, lastStatus: string): Promise<void> {
    await this.pool.query(
      `UPDATE scheduler.scheduled_jobs
       SET last_run_at = now(), last_status = $2, next_run_at = $3, updated_at = now()
       WHERE id = $1`,
      [id, lastStatus, nextRunAt],
    );
  }

  // "run now" (scope.md §27 point 8) updates last_run_at/last_status like any other run, but
  // deliberately leaves next_run_at untouched — it's a bypass for manual testing, not a
  // reschedule of the regular timer-driven cadence.
  async recordManualRun(id: string, lastStatus: string): Promise<void> {
    await this.pool.query(
      `UPDATE scheduler.scheduled_jobs
       SET last_run_at = now(), last_status = $2, updated_at = now()
       WHERE id = $1`,
      [id, lastStatus],
    );
  }
}
