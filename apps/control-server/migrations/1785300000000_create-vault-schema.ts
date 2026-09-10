import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Secrets Vault (Phase 16, scope.md §30). packages/database-bootstrap/sql/002_schemas.sql
// creates the `vault` schema on a *fresh* install (docker-entrypoint-initdb.d only ever runs
// against an empty data directory) — but an existing deployment upgrading in place never re-runs
// bootstrap SQL at all, so this migration must be able to create the schema itself too, or the
// upgrade fails with "schema vault does not exist" the moment this migration tries to create a
// table inside it (confirmed live 2026-09-09 against a real pre-existing deployment). baas_admin
// already holds CREATE ON DATABASE (granted in the same bootstrap script, relied on since Phase 9
// for runtime api_<slug> schema creation), so it's entitled to do this itself.
// `ifNotExists: true` makes this a no-op on a fresh install where bootstrap already created it.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createSchema('vault', { ifNotExists: true, authorization: 'baas_admin' });
  pgm.createTable(
    { schema: 'vault', name: 'secrets' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      project_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'platform', name: 'projects' },
        onDelete: 'CASCADE',
      },
      name: { type: 'text', notNull: true },
      // Public data, generated fresh per encryption (never reused) — safe to store alongside
      // the ciphertext it protects. See VaultCryptoService.
      nonce: { type: 'bytea', notNull: true },
      // XSalsa20-Poly1305 (libsodium crypto_secretbox), key from VAULT_MASTER_KEY_BASE64. No
      // version-history table by design (scope.md §30 point 1) — a rotate overwrites this
      // column in place via the same unique(project_id, name) upsert that create() uses.
      ciphertext: { type: 'bytea', notNull: true },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.addConstraint({ schema: 'vault', name: 'secrets' }, 'secrets_project_name_unique', {
    unique: ['project_id', 'name'],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable({ schema: 'vault', name: 'secrets' });
}
