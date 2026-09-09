import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Scheduler (Phase 13, scope.md §27). The `scheduler` schema itself is created by
// packages/database-bootstrap/sql/002_schemas.sql (superuser-run bootstrap, same convention as
// storage/hosting/functions/vault) — this migration only creates the tables within it.
export async function up(pgm: MigrationBuilder): Promise<void> {
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
