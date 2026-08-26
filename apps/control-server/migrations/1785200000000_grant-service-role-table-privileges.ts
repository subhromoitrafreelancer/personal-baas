import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Backfill for every project provisioned before projects.repository.ts's provisionAndInsert()
// started setting this up itself (Phase 9 provisioning only ever granted schema USAGE to
// service_role_<slug>, never table-level privileges). BYPASSRLS lets service_role_<slug> skip
// row-security *policy* evaluation, but Postgres still enforces the base table-privilege check
// regardless — confirmed live against every existing project (api, api_ats, api_ecns_kel,
// api_ecns_yyt): service_role had zero table grants in all four, so it could see nothing
// through PostgREST despite anon/authenticated being correctly set up. This is what made every
// project's OpenAPI spec (fetched by db-explorer.service.ts authenticating as service_role) show
// RPC functions only — Postgres functions default to PUBLIC EXECUTE, tables don't.
//
// For each project this both (a) fixes already-created tables/sequences retroactively, and
// (b) sets default privileges so any table/sequence baas_admin creates after this migration
// runs is automatically covered too — the same statements provisionAndInsert() now runs for
// brand-new projects. Only touches the platform's own service_role grants, never table
// structure/data/RLS, so it doesn't conflict with distribution-kit/upgrade.md's promise that an
// upgrade never touches user schema objects.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $do$
    DECLARE
      proj RECORD;
    BEGIN
      FOR proj IN SELECT schema_name, service_role_role FROM platform.projects LOOP
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE baas_admin IN SCHEMA %I GRANT ALL ON TABLES TO %I',
          proj.schema_name, proj.service_role_role
        );
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE baas_admin IN SCHEMA %I GRANT ALL ON SEQUENCES TO %I',
          proj.schema_name, proj.service_role_role
        );
        EXECUTE format(
          'GRANT ALL ON ALL TABLES IN SCHEMA %I TO %I',
          proj.schema_name, proj.service_role_role
        );
        EXECUTE format(
          'GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO %I',
          proj.schema_name, proj.service_role_role
        );
      END LOOP;
    END
    $do$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $do$
    DECLARE
      proj RECORD;
    BEGIN
      FOR proj IN SELECT schema_name, service_role_role FROM platform.projects LOOP
        EXECUTE format(
          'REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I',
          proj.schema_name, proj.service_role_role
        );
        EXECUTE format(
          'REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM %I',
          proj.schema_name, proj.service_role_role
        );
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE baas_admin IN SCHEMA %I REVOKE ALL ON TABLES FROM %I',
          proj.schema_name, proj.service_role_role
        );
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE baas_admin IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM %I',
          proj.schema_name, proj.service_role_role
        );
      END LOOP;
    END
    $do$;
  `);
}
