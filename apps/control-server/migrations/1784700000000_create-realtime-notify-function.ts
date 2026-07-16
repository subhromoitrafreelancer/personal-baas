import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Phase 8.1 (scope.md §22): reusable row-level trigger function developers attach to their own
// api.<table> via the SQL editor's realtime snippet (see realtime-snippets.js) — this migration
// only creates the function, never a trigger on any specific table, since attachment is
// per-table and developer-driven, same convention as the RLS snippet library.
//
// Unlike platform.notify_pgrst_reload_schema() (packages/database-bootstrap), this does NOT need
// superuser: it's an ordinary AFTER INSERT/UPDATE/DELETE trigger, not an event trigger, so
// baas_admin can create it like any other function — hence a node-pg-migrate migration instead
// of bootstrap SQL.
//
// A single shared 'realtime_changes' NOTIFY channel is used for every table (the Phase 8.4
// gateway holds one persistent LISTEN connection and matches subscribers by table/filter
// in-process, so per-table channels would add nothing). The pg_notify call is wrapped in its own
// exception handler: NOTIFY payloads are capped at 8000 bytes by Postgres, and a wide row must
// never cause the underlying INSERT/UPDATE/DELETE to roll back just because its change
// notification didn't fit.
const FUNCTION_SQL = `
create function platform.notify_realtime_change() returns trigger
language plpgsql
as $$
declare
  payload json;
begin
  payload := json_build_object(
    'schema', TG_TABLE_SCHEMA,
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'record', case when TG_OP = 'DELETE' then row_to_json(OLD) else row_to_json(NEW) end
  );

  begin
    perform pg_notify('realtime_changes', payload::text);
  exception when others then
    null;
  end;

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;
`;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(FUNCTION_SQL);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropFunction({ schema: 'platform', name: 'notify_realtime_change' }, []);
}
