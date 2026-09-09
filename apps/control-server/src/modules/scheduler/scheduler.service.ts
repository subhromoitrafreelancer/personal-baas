import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { computeNextRunAt } from './cron.util';
import { JobRunsRepository } from './job-runs.repository';
import { SchedulerRepository } from './scheduler.repository';
import { SchedulerTimerService } from './scheduler-timer.service';
import { ScheduledJobRow } from './scheduler.types';

function toPublicJob(row: ScheduledJobRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    functionId: row.function_id,
    cronExpression: row.cron_expression,
    enabled: row.enabled,
    nextRunAt: row.next_run_at?.toISOString() ?? null,
    lastRunAt: row.last_run_at?.toISOString() ?? null,
    lastStatus: row.last_status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// CRUD + validation for scheduled jobs (scope.md §27). Owns nothing about *firing* jobs — that's
// SchedulerTimerService's job, which this only ever pokes via rescheduleSoonest() after a
// mutation that could move the soonest-upcoming job earlier (create, cron-expression change,
// re-enable).
@Injectable()
export class SchedulerService {
  constructor(
    private readonly repo: SchedulerRepository,
    private readonly runs: JobRunsRepository,
    private readonly timer: SchedulerTimerService,
  ) {}

  async list(projectId: string) {
    const rows = await this.repo.list(projectId);
    return rows.map(toPublicJob);
  }

  async create(
    projectId: string,
    name: string,
    functionId: string,
    cronExpression: string,
    enabled: boolean,
  ) {
    const existing = await this.repo.findByProjectAndName(projectId, name);
    if (existing) {
      throw new ConflictException(`Scheduled job "${name}" already exists`);
    }
    const nextRunAt = computeNextRunAt(cronExpression, new Date());
    const row = await this.repo.create(
      projectId,
      name,
      functionId,
      cronExpression,
      enabled,
      nextRunAt,
    );
    await this.timer.rescheduleSoonest();
    return toPublicJob(row);
  }

  async update(
    id: string,
    patch: { functionId?: string; cronExpression?: string; enabled?: boolean },
  ): Promise<ReturnType<typeof toPublicJob>> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException('Scheduled job not found');
    }
    // Any change to the cron expression, or (re-)enabling a job, invalidates whatever
    // next_run_at was last computed — recompute from now rather than leaving a stale value the
    // timer would otherwise fire on the *old* schedule.
    const cronChanged =
      patch.cronExpression !== undefined && patch.cronExpression !== existing.cron_expression;
    const reEnabled = patch.enabled === true && !existing.enabled;
    const nextRunAt =
      cronChanged || reEnabled
        ? computeNextRunAt(patch.cronExpression ?? existing.cron_expression, new Date())
        : undefined;

    const row = await this.repo.update(id, { ...patch, nextRunAt });
    if (!row) {
      throw new NotFoundException('Scheduled job not found');
    }
    await this.timer.rescheduleSoonest();
    return toPublicJob(row);
  }

  async delete(id: string) {
    const row = await this.repo.delete(id);
    if (!row) {
      throw new NotFoundException('Scheduled job not found');
    }
    await this.timer.rescheduleSoonest();
    return { deleted: true };
  }

  async listRuns(jobId: string) {
    const rows = await this.runs.listByJob(jobId);
    return rows.map((row) => ({
      id: row.id,
      startedAt: row.started_at.toISOString(),
      finishedAt: row.finished_at?.toISOString() ?? null,
      status: row.status,
      error: row.error,
    }));
  }

  // "run now" bypasses next_run_at entirely, per scope.md §27 point 8 — still goes through the
  // exact same execution path (and still writes a job_runs row), just triggered manually.
  async runNow(id: string): Promise<void> {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new NotFoundException('Scheduled job not found');
    }
    await this.timer.runNow(row);
  }
}
