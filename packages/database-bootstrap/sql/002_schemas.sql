-- baas_admin owns every schema below, but ownership alone doesn't let it CREATE new ones —
-- that needs CREATE on the database itself, which by default only the database owner (the
-- superuser running this bootstrap) and superusers have. Phase 9 (scope.md §23) has
-- baas_admin create a new api_<slug> schema at runtime for each project, so it needs this
-- grant even though every schema created during bootstrap itself is fine without it.
-- GRANT ... ON DATABASE requires a literal identifier, not an expression, so
-- current_database() can't be used directly as the target — EXECUTE/format() it instead.
do $$
begin
  execute format('grant create on database %I to baas_admin', current_database());
end
$$;

-- Schema exposure convention (scope.md §12): only `api` is ever exposed through PostgREST.
-- Owned by baas_admin (scope.md §9: "baas_admin: schema administration, SQL editor
-- execution, migration execution") so the control service's admin connection and
-- node-pg-migrate can create/alter objects without extra per-schema grants.
create schema if not exists platform authorization baas_admin;
create schema if not exists auth authorization baas_admin;
create schema if not exists api authorization baas_admin;
create schema if not exists private authorization baas_admin;
-- Storage metadata (Phase 7, scope.md §21): storage.buckets/storage.objects. Never exposed
-- through PostgREST (not in PGRST_DB_SCHEMAS) — access is enforced entirely in the control
-- service's own storage module via its baas_admin connection, same as platform/auth.
create schema if not exists storage authorization baas_admin;
-- Hosting metadata (Phase 11, scope.md §25): hosting.sites/hosting.site_files. Same convention
-- as storage — never exposed through PostgREST, access enforced entirely in the control
-- service's own hosting module via its baas_admin connection.
create schema if not exists hosting authorization baas_admin;

revoke all on schema auth, platform, private, storage, hosting from public;
