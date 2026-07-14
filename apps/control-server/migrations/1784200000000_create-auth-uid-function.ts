import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Ergonomic RLS helper (Phase 4.1, scope.md §8-9): reads the `sub` claim out of the
// `request.jwt.claims` JSON GUC PostgREST sets for the current request, so policies can write
// `USING (user_id = auth.uid())` instead of repeating the current_setting/cast boilerplate.
// PostgREST v12 only sets the consolidated `request.jwt.claims` JSON GUC — the older flattened
// `request.jwt.claim.<name>` GUCs some examples online still reference are gone, confirmed by
// probing a live token through PostgREST while wiring this up. `stable` (not `immutable`)
// because its result depends on the request-scoped GUC.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createFunction(
    { schema: 'auth', name: 'uid' },
    [],
    {
      returns: 'uuid',
      language: 'sql',
      behavior: 'STABLE',
    },
    `select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid`,
  );

  pgm.sql('grant execute on function auth.uid() to anon, authenticated, service_role');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropFunction({ schema: 'auth', name: 'uid' }, []);
}
