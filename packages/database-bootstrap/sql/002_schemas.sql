-- Schema exposure convention (scope.md §12): only `api` is ever exposed through PostgREST.
-- Owned by baas_admin (scope.md §9: "baas_admin: schema administration, SQL editor
-- execution, migration execution") so the control service's admin connection and
-- node-pg-migrate can create/alter objects without extra per-schema grants.
create schema if not exists platform authorization baas_admin;
create schema if not exists auth authorization baas_admin;
create schema if not exists api authorization baas_admin;
create schema if not exists private authorization baas_admin;

revoke all on schema auth, platform, private from public;
