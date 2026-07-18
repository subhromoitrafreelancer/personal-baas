import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Static hosting metadata (Phase 11, scope.md §25). The `hosting` schema itself is created by
// packages/database-bootstrap/sql/002_schemas.sql (superuser-run bootstrap, same convention as
// platform/auth/api/private/storage) — this migration only creates the tables within it.
// One active deployment per project in v1 (hosting.sites.project_id is unique), not a history
// of named environments/previews — a redeploy fully replaces the previous one's file list.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    { schema: 'hosting', name: 'sites' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      project_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'platform', name: 'projects' },
        onDelete: 'CASCADE',
      },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.createIndex({ schema: 'hosting', name: 'sites' }, 'project_id', { unique: true });

  pgm.createTable(
    { schema: 'hosting', name: 'site_files' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      site_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'hosting', name: 'sites' },
        onDelete: 'CASCADE',
      },
      path: { type: 'text', notNull: true },
      size: { type: 'bigint', notNull: true },
      content_type: { type: 'text' },
      deployed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.addConstraint({ schema: 'hosting', name: 'site_files' }, 'site_files_site_path_unique', {
    unique: ['site_id', 'path'],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable({ schema: 'hosting', name: 'site_files' });
  pgm.dropTable({ schema: 'hosting', name: 'sites' });
}
