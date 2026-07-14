import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    { schema: 'platform', name: 'admin_sql_history' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      admin_id: {
        type: 'uuid',
        references: { schema: 'platform', name: 'platform_admins' },
        onDelete: 'SET NULL',
      },
      // Denormalized snapshot so history rows stay meaningful even if the admin account is
      // later removed or its email changes.
      admin_email: { type: 'text', notNull: true },
      mode: { type: 'text', notNull: true, check: "mode in ('statement', 'script')" },
      sql: { type: 'text', notNull: true },
      success: { type: 'boolean', notNull: true },
      error_message: { type: 'text' },
      statement_count: { type: 'integer', notNull: true },
      duration_ms: { type: 'integer', notNull: true },
      executed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );

  pgm.createIndex({ schema: 'platform', name: 'admin_sql_history' }, 'executed_at');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable({ schema: 'platform', name: 'admin_sql_history' });
}
