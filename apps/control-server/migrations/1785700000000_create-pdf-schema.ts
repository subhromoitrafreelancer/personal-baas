import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// PDF Generation (Phase 20, scope.md §34). Creates its own `pdf` schema rather than relying on
// packages/database-bootstrap/sql/002_schemas.sql — the same upgrade-safety fix already applied
// to vault/scheduler/email from the start (bootstrap only ever runs against a fresh, empty data
// directory; an existing deployment upgrading in place needs this migration to create its own
// schema or it fails with "schema pdf does not exist").
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createSchema('pdf', { ifNotExists: true, authorization: 'baas_admin' });

  pgm.createTable(
    { schema: 'pdf', name: 'provider_configs' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      project_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'platform', name: 'projects' },
        onDelete: 'CASCADE',
      },
      api_url: { type: 'text', notNull: true },
      // Header name to send the vendor's secret under (e.g. "Authorization", "X-Api-Key") — the
      // secret value itself lives in that project's own Secrets Vault, not here.
      auth_header: { type: 'text' },
      html_field: { type: 'text', notNull: true, default: 'html' },
      response_mode: {
        type: 'text',
        notNull: true,
        default: 'binary',
        check: "response_mode in ('binary', 'json_url', 'json_base64')",
      },
      enabled: { type: 'boolean', notNull: true, default: true },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  // One active config per project (scope.md §34 point 2) — no "provider" column: there is only
  // one real adapter (GenericHttpPdfProvider), vendor identity lives entirely in api_url/
  // response_mode.
  pgm.addConstraint(
    { schema: 'pdf', name: 'provider_configs' },
    'provider_configs_project_unique',
    { unique: ['project_id'] },
  );

  pgm.createTable(
    { schema: 'pdf', name: 'render_requests' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      project_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'platform', name: 'projects' },
        onDelete: 'CASCADE',
      },
      status: { type: 'text', notNull: true, check: "status in ('success', 'failed')" },
      duration_ms: { type: 'integer' },
      output_bytes: { type: 'integer' },
      error: { type: 'text' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.createIndex({ schema: 'pdf', name: 'render_requests' }, 'project_id');
  pgm.createIndex({ schema: 'pdf', name: 'render_requests' }, 'created_at');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable({ schema: 'pdf', name: 'render_requests' });
  pgm.dropTable({ schema: 'pdf', name: 'provider_configs' });
}
