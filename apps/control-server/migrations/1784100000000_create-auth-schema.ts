import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Application-user auth tables (scope.md §7). All application-user access still goes
// through PostgREST, never through the control service — these tables back the control
// service's own /auth/v1/* endpoints (signup/login/refresh/etc.), which is a separate
// concern from the `api` schema's RLS-governed application data.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    { schema: 'auth', name: 'users' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      email: { type: 'text', notNull: true },
      password_hash: { type: 'text', notNull: true },
      status: {
        type: 'text',
        notNull: true,
        default: 'active',
        check: "status in ('active', 'disabled', 'invited')",
      },
      email_verified: { type: 'boolean', notNull: true, default: false },
      role: { type: 'text', notNull: true, default: 'authenticated' },
      user_metadata: { type: 'jsonb', notNull: true, default: '{}' },
      app_metadata: { type: 'jsonb', notNull: true, default: '{}' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      last_sign_in_at: { type: 'timestamptz' },
      password_changed_at: { type: 'timestamptz' },
    },
  );
  // Case-insensitive uniqueness without depending on the citext extension (same convention
  // as platform.platform_admins).
  pgm.createIndex({ schema: 'auth', name: 'users' }, 'lower(email)', {
    unique: true,
    name: 'auth_users_email_lower_idx',
  });

  // Structural per §7's core-table list. Not written to in v1 (email/password only, no
  // social login/identity linking — scope.md §6) but present so a future auth provider
  // doesn't require a shape change to auth.users.
  pgm.createTable(
    { schema: 'auth', name: 'identities' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      user_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'auth', name: 'users' },
        onDelete: 'CASCADE',
      },
      provider: { type: 'text', notNull: true, default: 'email' },
      provider_user_id: { type: 'text', notNull: true },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.addConstraint({ schema: 'auth', name: 'identities' }, 'identities_provider_unique', {
    unique: ['provider', 'provider_user_id'],
  });

  pgm.createTable(
    { schema: 'auth', name: 'sessions' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      user_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'auth', name: 'users' },
        onDelete: 'CASCADE',
      },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      expires_at: { type: 'timestamptz', notNull: true },
      revoked_at: { type: 'timestamptz' },
      ip_address: { type: 'inet' },
      user_agent: { type: 'text' },
    },
  );
  pgm.createIndex({ schema: 'auth', name: 'sessions' }, 'user_id');

  pgm.createTable(
    { schema: 'auth', name: 'refresh_tokens' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      session_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'auth', name: 'sessions' },
        onDelete: 'CASCADE',
      },
      // Never store the raw refresh token (scope.md §7) — only its SHA-256 hash.
      token_hash: { type: 'text', notNull: true },
      family_id: { type: 'uuid', notNull: true },
      parent_token_id: {
        type: 'uuid',
        references: { schema: 'auth', name: 'refresh_tokens' },
        onDelete: 'SET NULL',
      },
      issued_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      expires_at: { type: 'timestamptz', notNull: true },
      consumed_at: { type: 'timestamptz' },
      revoked_at: { type: 'timestamptz' },
    },
  );
  pgm.createIndex({ schema: 'auth', name: 'refresh_tokens' }, 'token_hash', { unique: true });
  pgm.createIndex({ schema: 'auth', name: 'refresh_tokens' }, 'family_id');
  pgm.createIndex({ schema: 'auth', name: 'refresh_tokens' }, 'session_id');

  pgm.createTable(
    { schema: 'auth', name: 'password_reset_tokens' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      user_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'auth', name: 'users' },
        onDelete: 'CASCADE',
      },
      token_hash: { type: 'text', notNull: true },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      expires_at: { type: 'timestamptz', notNull: true },
      used_at: { type: 'timestamptz' },
    },
  );
  pgm.createIndex({ schema: 'auth', name: 'password_reset_tokens' }, 'token_hash', { unique: true });

  pgm.createTable(
    { schema: 'auth', name: 'audit_events' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      user_id: {
        type: 'uuid',
        references: { schema: 'auth', name: 'users' },
        onDelete: 'SET NULL',
      },
      event_type: { type: 'text', notNull: true },
      ip_address: { type: 'inet' },
      user_agent: { type: 'text' },
      metadata: { type: 'jsonb', notNull: true, default: '{}' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.createIndex({ schema: 'auth', name: 'audit_events' }, 'user_id');
  pgm.createIndex({ schema: 'auth', name: 'audit_events' }, 'event_type');
  pgm.createIndex({ schema: 'auth', name: 'audit_events' }, 'created_at');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable({ schema: 'auth', name: 'audit_events' });
  pgm.dropTable({ schema: 'auth', name: 'password_reset_tokens' });
  pgm.dropTable({ schema: 'auth', name: 'refresh_tokens' });
  pgm.dropTable({ schema: 'auth', name: 'sessions' });
  pgm.dropTable({ schema: 'auth', name: 'identities' });
  pgm.dropTable({ schema: 'auth', name: 'users' });
}
