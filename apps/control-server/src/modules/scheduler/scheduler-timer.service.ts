import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AuthJwtService } from '../auth/auth-jwt.service';
import { FunctionsRepository } from '../functions/functions.repository';
import { FunctionsService } from '../functions/functions.service';
import { ProjectsService } from '../projects/projects.service';
import { computeNextRunAt } from './cron.util';
import { JobRunsRepository } from './job-runs.repository';
import { SchedulerRepository } from './scheduler.repository';
import { ScheduledJobRow } from './scheduler.types';

// Extra grace period on top of a function's own timeout_ms, mirroring
// FunctionsService.RUNNER_CALL_GRACE_MS — the internal role token minted below must not expire
// before the invocation it authorizes could plausibly finish.
const TOKEN_TTL_GRACE_SECONDS = 5;

// The in-process scheduler (Phase 13, scope.md §27) — a single persistent timer, not a
// per-second poll, same "one long-lived worker" shape as RealtimeListenerService's LISTEN
// connection (Phase 8). Holds exactly one active setTimeout at a time, always pointed at the
// soonest enabled job's next_run_at across every project; a create/update/delete/enable-toggle
// anywhere calls rescheduleSoonest() so the timer never waits out a now-stale schedule.
//
// Single-instance caveat (scope.md §27 point 7): correct only for one control-server replica.
// Multiple replicas would each independently fire every job — not addressed here, not needed
// for today's single-instance deployment target.
@Injectable()
export class SchedulerTimerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerTimerService.name);
  private timeoutHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly repo: SchedulerRepository,
    private readonly runs: JobRunsRepository,
    private readonly functionsRepo: FunctionsRepository,
    private readonly functionsService: FunctionsService,
    private readonly projects: ProjectsService,
    private readonly authJwt: AuthJwtService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rescheduleSoonest();
  }

  onModuleDestroy(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  // Called after every mutation that could move the soonest-upcoming job earlier or later
  // (SchedulerService's create/update/delete). Also self-calls after each tick to pick the next
  // job to wait for. A job whose next_run_at has already passed (e.g. control-server was down
  // when it was due) gets a ~0ms delay, so it fires almost immediately on the next tick rather
  // than waiting a full cycle — this is what gives the "run exactly once on restart, not once
  // per missed tick" behavior (scope.md §27 point 6): the recompute inside executeJob always
  // bases the next occurrence on the actual current time, not the stale original next_run_at.
  async rescheduleSoonest(): Promise<void> {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    const soonest = await this.repo.findSoonestEnabled();
    if (!soonest?.next_run_at) {
      return;
    }
    const delayMs = Math.max(0, soonest.next_run_at.getTime() - Date.now());
    this.timeoutHandle = setTimeout(() => void this.onTick(), delayMs);
  }

  private async onTick(): Promise<void> {
    this.timeoutHandle = null;
    const due = await this.repo.findDue(new Date());
    await Promise.all(
      due.map((job) =>
        this.executeJob(job, { advanceSchedule: true }).catch((err) =>
          this.logger.error({ msg: 'scheduled job execution failed', jobId: job.id, err }),
        ),
      ),
    );
    await this.rescheduleSoonest();
  }

  // "run now" (scope.md §27 point 8's admin action) — same execution path, but deliberately
  // does not touch next_run_at: it's a bypass for manual testing, not a reschedule.
  async runNow(job: ScheduledJobRow): Promise<void> {
    await this.executeJob(job, { advanceSchedule: false });
  }

  private async executeJob(
    job: ScheduledJobRow,
    options: { advanceSchedule: boolean },
  ): Promise<void> {
    // Skip if a run for this job hasn't finished yet (scope.md §27 point 5) — applies equally
    // to a due-tick firing and a manual "run now" arriving mid-run.
    if (await this.runs.hasInFlight(job.id)) {
      return;
    }

    const run = await this.runs.start(job.id);
    let status: string;
    let errorMessage: string | null = null;
    try {
      const fn = await this.functionsRepo.findById(job.function_id);
      if (!fn) {
        throw new Error(`Target function ${job.function_id} not found`);
      }
      const project = await this.projects.getById(job.project_id);
      const ttlSeconds = Math.ceil(fn.timeout_ms / 1000) + TOKEN_TTL_GRACE_SECONDS;
      // Real service_role-scoped JWT, not a bare ctx.auth object — this is what actually grants
      // ctx.rest calls RLS-bypassing service_role access (scope.md §27 point 3); ctx.auth below
      // is informational only, read by function code, not consulted by PostgREST.
      const token = await this.authJwt.signInternalRoleToken(
        project.service_role_role,
        project.id,
        ttlSeconds,
      );

      const result = await this.functionsService.invoke({
        fn,
        project: { id: project.id, slug: project.slug, schemaName: project.schema_name },
        auth: { sub: null, role: project.service_role_role, email: null },
        body: null,
        headers: {},
        query: {},
        callerAuthorization: `Bearer ${token}`,
      });

      status = result.kind;
      errorMessage =
        result.kind === 'function-error'
          ? result.message
          : result.kind === 'unavailable'
            ? 'function-runner unavailable'
            : result.kind === 'timeout'
              ? 'Function execution timed out'
              : null;
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    await this.runs.finish(run.id, status, errorMessage);

    if (options.advanceSchedule) {
      const nextRunAt = computeNextRunAt(job.cron_expression, new Date());
      await this.repo.recordRunResult(job.id, nextRunAt, status);
    } else {
      // "run now" still updates last_run_at/last_status (so the admin UI reflects it), just
      // never next_run_at — the regular schedule is left exactly as it was.
      await this.repo.recordManualRun(job.id, status);
    }
  }
}
