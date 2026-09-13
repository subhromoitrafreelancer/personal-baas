import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Multi-Factor Authentication (Phase 19, scope.md §33). Project-level policy toggle plus
// per-user TOTP factor + backup codes.
export async function up(pgm: MigrationBuilder): Promise<void> {
  // Plain column, matching how schema_name/anon_role/authenticated_role/service_role_role
  // already live directly on platform.projects — no generic "project settings" table exists
  // yet, and one isn't needed for a single flag. Default false: MFA is opt-in per project.
  pgm.addColumn(
    { schema: 'platform', name: 'projects' },
    {
      mfa_required: { type: 'boolean', notNull: true, default: false },
    },
  );

  pgm.createTable(
    { schema: 'auth', name: 'mfa_factors' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      user_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'auth', name: 'users' },
        onDelete: 'CASCADE',
      },
      type: { type: 'text', notNull: true, default: 'totp' },
      // Encrypted with the exact same libsodium primitive and VAULT_MASTER_KEY_BASE64 master
      // key already built for the Secrets Vault (§30 point 3) — no new crypto dependency, no
      // second master key to manage or lose.
      secret_nonce: { type: 'bytea', notNull: true },
      secret_ciphertext: { type: 'bytea', notNull: true },
      // A factor is never usable for login purposes until verified — prevents a user locking
      // themselves out by enrolling with a misconfigured authenticator app before ever
      // confirming it works.
      verified: { type: 'boolean', notNull: true, default: false },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      verified_at: { type: 'timestamptz' },
    },
  );
  // One TOTP factor per user in v1 (not multiple enrolled devices) — multiple factors per user
  // is a reasonable later extension, not required now.
  pgm.addConstraint({ schema: 'auth', name: 'mfa_factors' }, 'mfa_factors_user_unique', {
    unique: ['user_id'],
  });

  pgm.createTable(
    { schema: 'auth', name: 'mfa_backup_codes' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      user_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'auth', name: 'users' },
        onDelete: 'CASCADE',
      },
      // Argon2id, the same password-hashing primitive already in the stack (§5) — one-time use
      // (used_at set on redemption, a used code is never valid again).
      code_hash: { type: 'text', notNull: true },
      used_at: { type: 'timestamptz' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.createIndex({ schema: 'auth', name: 'mfa_backup_codes' }, 'user_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable({ schema: 'auth', name: 'mfa_backup_codes' });
  pgm.dropTable({ schema: 'auth', name: 'mfa_factors' });
  pgm.dropColumn({ schema: 'platform', name: 'projects' }, 'mfa_required');
}
