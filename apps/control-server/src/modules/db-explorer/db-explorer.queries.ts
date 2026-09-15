// System schemas are never useful to show in the admin object explorer. Takes the table alias
// the nspname column is qualified with in each query (they differ: n, or none for pg_namespace
// itself), since this is spliced into a WHERE clause rather than parameterized.
const systemSchemaFilter = (alias: string) => `${alias}nspname not in ('pg_catalog', 'information_schema')
  and ${alias}nspname not like 'pg\\_toast%' and ${alias}nspname not like 'pg\\_temp\\_%'`;

export const SCHEMAS_QUERY = `
  select nspname as schema
  from pg_catalog.pg_namespace
  where ${systemSchemaFilter('')}
  order by nspname
`;

export const TABLES_QUERY = `
  select
    n.nspname as schema,
    c.relname as name,
    case c.relkind
      when 'r' then 'table'
      when 'v' then 'view'
      when 'm' then 'materialized_view'
      when 'p' then 'partitioned_table'
      when 'f' then 'foreign_table'
    end as kind,
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as rls_forced,
    obj_description(c.oid, 'pg_class') as comment
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'v', 'm', 'p', 'f')
    and ${systemSchemaFilter('n.')}
  order by n.nspname, c.relname
`;

export const COLUMNS_QUERY = `
  select
    table_schema as schema,
    table_name as "table",
    column_name as name,
    data_type as data_type,
    is_nullable = 'YES' as nullable,
    column_default as default,
    ordinal_position as position
  from information_schema.columns
  where table_schema not in ('pg_catalog', 'information_schema')
  order by table_schema, table_name, ordinal_position
`;

// Deliberately a separate query from COLUMNS_QUERY (merged by schema/table/name key in
// db-explorer.service.ts) rather than rewriting COLUMNS_QUERY from information_schema to
// pg_catalog to get a table oid into the same query — col_description() needs (table oid,
// attnum), and reworking the existing, working COLUMNS_QUERY just to add that carries real
// behavior-change risk for no upside (scope.md §37 point 1).
export const COLUMN_COMMENTS_QUERY = `
  select
    n.nspname as schema,
    c.relname as "table",
    a.attname as name,
    col_description(c.oid, a.attnum) as comment
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where a.attnum > 0 and not a.attisdropped
    and ${systemSchemaFilter('n.')}
`;

export const CONSTRAINTS_QUERY = `
  select
    n.nspname as schema,
    c.relname as "table",
    con.conname as name,
    con.contype as type,
    array(
      select a.attname::text
      from unnest(con.conkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
      order by k.ord
    ) as columns
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where con.contype in ('p', 'u')
    and ${systemSchemaFilter('n.')}
  order by n.nspname, c.relname, con.conname
`;

export const FOREIGN_KEYS_QUERY = `
  select
    n.nspname as schema,
    c.relname as "table",
    con.conname as name,
    array(
      select a.attname::text
      from unnest(con.conkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
      order by k.ord
    ) as columns,
    fn.nspname as references_schema,
    fc.relname as references_table,
    array(
      select a.attname::text
      from unnest(con.confkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum
      order by k.ord
    ) as references_columns
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_class fc on fc.oid = con.confrelid
  join pg_namespace fn on fn.oid = fc.relnamespace
  where con.contype = 'f'
    and ${systemSchemaFilter('n.')}
  order by n.nspname, c.relname, con.conname
`;

export const INDEXES_QUERY = `
  select schemaname as schema, tablename as "table", indexname as name, indexdef as definition
  from pg_indexes
  where schemaname not in ('pg_catalog', 'information_schema')
  order by schemaname, tablename, indexname
`;

export const POLICIES_QUERY = `
  select
    schemaname as schema,
    tablename as "table",
    policyname as name,
    permissive,
    roles::text[] as roles,
    cmd as command,
    qual as using,
    with_check
  from pg_policies
  where schemaname not in ('pg_catalog', 'information_schema')
  order by schemaname, tablename, policyname
`;

export const FUNCTIONS_QUERY = `
  select
    p.oid::text as oid,
    n.nspname as schema,
    p.proname as name,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as return_type,
    l.lanname as language,
    obj_description(p.oid, 'pg_proc') as comment
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  where ${systemSchemaFilter('n.')}
    and p.prokind in ('f', 'p')
  order by n.nspname, p.proname
`;
