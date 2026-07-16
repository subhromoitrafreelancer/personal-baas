// Attachment snippet for Phase 8's platform.notify_realtime_change() trigger function (see
// migration 1784700000000_create-realtime-notify-function.ts) — same "developer picks it from
// the SQL editor, table name left as a placeholder" convention as rls-snippets.js, since
// attaching the trigger to a specific table is per-table and developer-driven, never automatic.
export const REALTIME_SNIPPETS = {
  'realtime-notify-trigger': `-- Realtime change notifications: broadcasts insert/update/delete on this table over the
-- 'realtime_changes' NOTIFY channel so the WebSocket gateway can fan events out to subscribers.
-- Requires platform.notify_realtime_change() (created by a node-pg-migrate migration).
drop trigger if exists <table_name>_realtime_notify on api.<table_name>;

create trigger <table_name>_realtime_notify
  after insert or update or delete on api.<table_name>
  for each row execute function platform.notify_realtime_change();
`,
};
