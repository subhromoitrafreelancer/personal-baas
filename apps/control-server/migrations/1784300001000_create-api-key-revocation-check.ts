import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Wired into PostgREST's db-pre-request (docker-compose.yml), which runs this before every
// single request. Without it, "Revoke" in the admin UI would only update our own bookkeeping
// row while the still-valid, still-signed JWT kept working until it expired — a misleading
// no-op for something that reads as a security control. SECURITY DEFINER (with search_path
// pinned, per the standard SECURITY DEFINER hardening advice) because anon/authenticated have
// no grant on `platform` and shouldn't get one just to make this check possible.
const FUNCTION_SQL = `
create function platform.check_api_key_revocation() returns void
language plpgsql
security definer
set search_path = platform, pg_catalog
as $$
declare
  key_id uuid;
begin
  key_id := nullif(current_setting('request.jwt.claims', true)::json->>'kid', '')::uuid;
  if key_id is null then
    return;
  end if;

  if exists (select 1 from platform.api_keys where id = key_id and revoked_at is not null) then
    raise insufficient_privilege using message = 'API key has been revoked';
  end if;
end;
$$;
`;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(FUNCTION_SQL);
  pgm.sql(
    'grant execute on function platform.check_api_key_revocation() to anon, authenticated, service_role',
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropFunction({ schema: 'platform', name: 'check_api_key_revocation' }, []);
}
