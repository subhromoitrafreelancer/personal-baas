import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Bookkeeping for publishable (anon) / secret (service_role) API keys (Phase 4.4,
// scope.md §9). The keys themselves are stateless signed JWTs (never stored — shown once at
// creation) carrying a `kid` claim that points back to this table's id, so revocation can be
// enforced via platform.check_api_key_revocation() (see the next migration) without needing a
// multi-key verification scheme — that's Phase 6 #2's "kid-based verification" territory.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    { schema: 'platform', name: 'api_keys' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      name: { type: 'text', notNull: true },
      kind: { type: 'text', notNull: true, check: "kind in ('publishable', 'secret')" },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      created_by: { type: 'text', notNull: true },
      revoked_at: { type: 'timestamptz' },
      revoked_by: { type: 'text' },
    },
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable({ schema: 'platform', name: 'api_keys' });
}
