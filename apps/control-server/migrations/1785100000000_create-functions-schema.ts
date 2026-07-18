import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Functions metadata (Phase 12, scope.md §26). The `functions` schema itself is created by
// packages/database-bootstrap/sql/002_schemas.sql (superuser-run bootstrap, same convention as
// platform/auth/api/private/storage/hosting) — this migration only creates the tables within it.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    { schema: 'functions', name: 'functions' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      project_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'platform', name: 'projects' },
        onDelete: 'CASCADE',
      },
      name: { type: 'text', notNull: true },
      // v1 stores function source directly as text, single-file, no npm dependencies — same
      // "paste and execute" spirit as the SQL editor rather than a zip/bundle in MinIO (scope.md
      // §26 point 2).
      code: { type: 'text', notNull: true },
      timeout_ms: { type: 'integer', notNull: true, default: 10000 },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.addConstraint({ schema: 'functions', name: 'functions' }, 'functions_project_name_unique', {
    unique: ['project_id', 'name'],
  });

  pgm.createTable(
    { schema: 'functions', name: 'invocations' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      function_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'functions', name: 'functions' },
        onDelete: 'CASCADE',
      },
      status: { type: 'text', notNull: true },
      duration_ms: { type: 'integer', notNull: true },
      error: { type: 'text' },
      invoked_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.createIndex({ schema: 'functions', name: 'invocations' }, 'function_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable({ schema: 'functions', name: 'invocations' });
  pgm.dropTable({ schema: 'functions', name: 'functions' });
}
