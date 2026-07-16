// format('%I.%I', ...) safely quotes the schema/table identifiers server-side regardless of
// case or special characters — belt-and-braces alongside RealtimeService's own identifier regex
// validation, same defense-in-depth spirit as the rest of this codebase's raw-SQL modules.
//
// to_regclass(...), not a bare has_table_privilege(role, 'schema.table', ...) text-arg call:
// the text-arg form resolves its target internally and *raises* if the relation doesn't exist
// (confirmed live — a subscribe request for a nonexistent table crashed the whole process via an
// unhandled rejection), whereas to_regclass() returns NULL for a missing relation and
// has_table_privilege(role, NULL, 'SELECT') then just returns NULL — coerced to `false` by the
// caller, exactly the right answer for "you can't SELECT a table that doesn't exist" without an
// exception in the path.
export const HAS_SELECT_GRANT_QUERY = `
  select has_table_privilege(
    $1,
    to_regclass(format('%I.%I', $2::text, $3::text)),
    'SELECT'
  ) as has_select
`;

export const COLUMN_EXISTS_QUERY = `
  select exists (
    select 1 from information_schema.columns
    where table_schema = $1 and table_name = $2 and column_name = $3
  ) as column_exists
`;
