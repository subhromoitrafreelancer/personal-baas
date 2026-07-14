import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// PGRST_DB_PRE_REQUEST (Phase 4.4) calls platform.check_api_key_revocation() before every
// single PostgREST request, regardless of role. Calling a schema-qualified function requires
// USAGE on its schema even with EXECUTE granted on the function itself (same lesson as
// 1784200001000_grant-schema-usage for auth.uid()) — without this, db-pre-request breaks
// every PostgREST request, not just ones using an API key, which a live test caught
// immediately ("permission denied for schema platform" on a plain anon-role call).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('grant usage on schema platform to anon, authenticated, service_role');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('revoke usage on schema platform from anon, authenticated, service_role');
}
