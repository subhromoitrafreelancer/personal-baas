import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    { schema: 'platform', name: 'platform_admins' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      email: { type: 'text', notNull: true },
      password_hash: { type: 'text', notNull: true },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      last_login_at: { type: 'timestamptz' },
    },
  );

  // Case-insensitive uniqueness without depending on the citext extension.
  pgm.createIndex(
    { schema: 'platform', name: 'platform_admins' },
    'lower(email)',
    { unique: true, name: 'platform_admins_email_lower_idx' },
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable({ schema: 'platform', name: 'platform_admins' });
}
