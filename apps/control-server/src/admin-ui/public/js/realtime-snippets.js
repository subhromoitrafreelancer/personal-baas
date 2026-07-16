// Attachment snippet for Phase 8's platform.notify_realtime_change() trigger function (see
// migration 1784700000000_create-realtime-notify-function.ts) — same "developer picks it from
// the SQL editor, table name left as a placeholder" convention as rls-snippets.js, since
// attaching the trigger to a specific table is per-table and developer-driven, never automatic.
//
// schemaName is auto-filled from the SQL editor's project selector, not left as a manual
// placeholder (see rls-snippets.js's header comment for why: an explicitly schema-qualified
// statement always overrides the SQL console's search_path, so a hardcoded `api.` would silently
// attach the trigger to the *default* project's table even while a different project is
// selected). No role names here — unlike the RLS snippets, this one grants nothing.
export const REALTIME_SNIPPETS = {
  'realtime-notify-trigger': (schemaName = 'api') => `-- Realtime change notifications: broadcasts insert/update/delete on this table over the
-- 'realtime_changes' NOTIFY channel so the WebSocket gateway can fan events out to subscribers.
-- Requires platform.notify_realtime_change() (created by a node-pg-migrate migration).
drop trigger if exists <table_name>_realtime_notify on ${schemaName}.<table_name>;

create trigger <table_name>_realtime_notify
  after insert or update or delete on ${schemaName}.<table_name>
  for each row execute function platform.notify_realtime_change();
`,
};
