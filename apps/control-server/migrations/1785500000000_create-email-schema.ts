import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Outbound Email (Phase 18, scope.md §32). Creates its own `email` schema rather than relying on
// packages/database-bootstrap/sql/002_schemas.sql the way earlier phases did (functions/hosting) —
// bootstrap only ever runs against a fresh, empty data directory, so an existing deployment
// upgrading in place would hit "schema email does not exist" the moment this migration tried to
// create a table inside it. This is the same bug found and fixed for vault/scheduler on 2026-09-09
// (see those migrations) — `email` gets the fix from the start instead of needing it retrofitted.
// `ifNotExists: true` makes this a no-op if a later bootstrap script is ever updated to include it.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createSchema('email', { ifNotExists: true, authorization: 'baas_admin' });

  pgm.createTable(
    { schema: 'email', name: 'provider_configs' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      project_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'platform', name: 'projects' },
        onDelete: 'CASCADE',
      },
      provider: { type: 'text', notNull: true, check: "provider in ('resend', 'smtp')" },
      from_address: { type: 'text', notNull: true },
      // Only used when provider = 'smtp'; null/unused for 'resend'.
      smtp_host: { type: 'text' },
      smtp_port: { type: 'integer' },
      smtp_secure: { type: 'boolean' },
      smtp_username: { type: 'text' },
      enabled: { type: 'boolean', notNull: true, default: true },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  // One active provider config per project (scope.md §32 point 2) — the provider's own secret
  // (API key / SMTP password) is deliberately not a column here; it lives in that project's own
  // Secrets Vault under the reserved name EMAIL_PROVIDER_SECRET (§32 point 3), reusing Phase 16's
  // encryption rather than adding a second one.
  pgm.addConstraint(
    { schema: 'email', name: 'provider_configs' },
    'provider_configs_project_unique',
    { unique: ['project_id'] },
  );

  pgm.createTable(
    { schema: 'email', name: 'sent_messages' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      project_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'platform', name: 'projects' },
        onDelete: 'CASCADE',
      },
      to_address: { type: 'text', notNull: true },
      subject: { type: 'text', notNull: true },
      provider: { type: 'text' },
      status: { type: 'text', notNull: true, check: "status in ('sent', 'failed')" },
      provider_message_id: { type: 'text' },
      error: { type: 'text' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.createIndex({ schema: 'email', name: 'sent_messages' }, 'project_id');
  pgm.createIndex({ schema: 'email', name: 'sent_messages' }, 'created_at');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable({ schema: 'email', name: 'sent_messages' });
  pgm.dropTable({ schema: 'email', name: 'provider_configs' });
}
