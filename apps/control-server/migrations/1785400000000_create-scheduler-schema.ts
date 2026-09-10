import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Scheduler (Phase 13, scope.md §27). packages/database-bootstrap/sql/002_schemas.sql creates
// the `scheduler` schema on a *fresh* install (docker-entrypoint-initdb.d only ever runs against
// an empty data directory) — but an existing deployment upgrading in place never re-runs
// bootstrap SQL at all, so this migration must be able to create the schema itself too, or the
// upgrade fails with "schema scheduler does not exist" (same class of bug confirmed live
// 2026-09-09 for the vault migration above). baas_admin already holds CREATE ON DATABASE
// (granted in the same bootstrap script, relied on since Phase 9 for runtime api_<slug> schema
// creation). `ifNotExists: true` makes this a no-op on a fresh install.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createSchema('scheduler', { ifNotExists: true, authorization: 'baas_admin' });
  pgm.createTable(
    { schema: 'scheduler', name: 'scheduled_jobs' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      project_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'platform', name: 'projects' },
        onDelete: 'CASCADE',
      },
      name: { type: 'text', notNull: true },
      function_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'functions', name: 'functions' },
        onDelete: 'CASCADE',
      },
      cron_expression: { type: 'text', notNull: true },
      enabled: { type: 'boolean', notNull: true, default: true },
      next_run_at: { type: 'timestamptz' },
      last_run_at: { type: 'timestamptz' },
      last_status: { type: 'text' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.addConstraint(
    { schema: 'scheduler', name: 'scheduled_jobs' },
    'scheduled_jobs_project_name_unique',
    {
      unique: ['project_id', 'name'],
    },
  );
  // The SchedulerTimerService's own startup/reschedule query: every enabled job ordered by
  // next_run_at, to find the soonest one to wake for.
  pgm.createIndex({ schema: 'scheduler', name: 'scheduled_jobs' }, ['enabled', 'next_run_at']);

  pgm.createTable(
    { schema: 'scheduler', name: 'job_runs' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      job_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'scheduler', name: 'scheduled_jobs' },
        onDelete: 'CASCADE',
      },
      started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      finished_at: { type: 'timestamptz' },
      status: { type: 'text' },
      error: { type: 'text' },
    },
  );
  pgm.createIndex({ schema: 'scheduler', name: 'job_runs' }, 'job_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable({ schema: 'scheduler', name: 'job_runs' });
  pgm.dropTable({ schema: 'scheduler', name: 'scheduled_jobs' });
}
