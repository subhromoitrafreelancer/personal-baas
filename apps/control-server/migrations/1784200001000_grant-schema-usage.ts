import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Schemas created with CREATE SCHEMA get no implicit PUBLIC grant in Postgres (unlike the
// built-in `public` schema pre-PG15) — confirmed by hitting "permission denied for schema
// api" through PostgREST while verifying Phase 4.1's JWT integration. USAGE on the schema is
// a prerequisite for any table-level grant to mean anything; it is not itself row/table
// access — anon and authenticated still get nothing on a given table until a developer grants
// it explicitly (scope.md §9: "anon: No access unless explicitly granted"), typically
// alongside that table's RLS policy (Phase 4.2's snippet library).
//
// USAGE on `auth` is also needed here (not just EXECUTE on auth.uid()) — calling a
// schema-qualified function requires USAGE on its schema regardless of EXECUTE grants on the
// function itself, which the same verification pass caught with a "permission denied for
// schema auth" error.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('grant usage on schema api to anon, authenticated, service_role');
  pgm.sql('grant usage on schema auth to anon, authenticated, service_role');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('revoke usage on schema auth from anon, authenticated, service_role');
  pgm.sql('revoke usage on schema api from anon, authenticated, service_role');
}
