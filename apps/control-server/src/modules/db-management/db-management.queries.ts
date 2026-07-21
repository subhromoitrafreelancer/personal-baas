// Catalog queries backing destructive Database Explorer actions (scope.md §29). Every query here
// is looked up by an already-verified oid/schema+name pair, never by interpolating admin-supplied
// path params directly into SQL text — see db-management.service.ts's getTableOid()/quoteIdent().

export const TABLE_OID_QUERY = `
  select c.oid::text as oid
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = $1 and c.relname = $2 and c.relkind in ('r', 'p')
`;

// reltuples is a planner estimate (updated by ANALYZE/autovacuum), not a live COUNT(*) — deliberate,
// since a full table scan just to populate a warning dialog would be its own footgun on a large table.
export const TABLE_ROW_ESTIMATE_QUERY = `
  select greatest(coalesce(c.reltuples, 0), 0)::bigint as estimate
  from pg_catalog.pg_class c
  where c.oid = $1::oid
`;

export const TABLE_OBJECT_COUNTS_QUERY = `
  select
    (select count(*) from pg_catalog.pg_index where indrelid = $1::oid) as index_count,
    (select count(*) from pg_catalog.pg_policy where polrelid = $1::oid) as policy_count,
    (select count(*) from pg_catalog.pg_trigger where tgrelid = $1::oid and not tgisinternal) as trigger_count
`;

export const TABLE_DEPENDENT_VIEWS_QUERY = `
  select distinct view_schema as schema, view_name as name
  from information_schema.view_table_usage
  where table_schema = $1 and table_name = $2
`;

export const COLUMN_DEPENDENT_VIEWS_QUERY = `
  select distinct view_schema as schema, view_name as name
  from information_schema.view_column_usage
  where table_schema = $1 and table_name = $2 and column_name = $3
`;

export const REFERENCING_FOREIGN_KEYS_QUERY = `
  select
    n.nspname as schema,
    c.relname as "table",
    con.conname as constraint_name
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where con.contype = 'f' and con.confrelid = $1::oid
`;

export const COLUMN_EXISTS_QUERY = `
  select attnum
  from pg_catalog.pg_attribute
  where attrelid = $1::oid and attname = $2 and not attisdropped
`;

export const COLUMN_IS_PRIMARY_KEY_QUERY = `
  select 1
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
  where con.conrelid = $1::oid and con.contype = 'p' and a.attname = $2
`;

// Best-effort text scan (scope.md §29 point 4) — scoped to one schema only (never cross-schema,
// consistent with the schema-per-project isolation model). prosrc is the raw function body;
// pg_get_functiondef would also work but includes the signature/declaration noise this scan
// doesn't need.
export const SCHEMA_FUNCTIONS_SOURCE_QUERY = `
  select p.oid::text as oid, p.proname as name, p.prosrc as source
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = $1 and p.prokind in ('f', 'p')
`;

export const FUNCTION_DEFINITION_QUERY = `
  select
    n.nspname as schema,
    p.proname as name,
    l.lanname as language,
    pg_get_functiondef(p.oid) as definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_language l on l.oid = p.prolang
  where p.oid = $1::oid
`;
