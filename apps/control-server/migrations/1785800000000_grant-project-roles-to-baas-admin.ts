import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Backfill for every project provisioned before projects.repository.ts's provisionAndInsert()
// started granting this itself (Phase 25 security remediation, scope.md §39). RealtimeService's
// per-subscriber RLS re-check (fixing the finding that dispatch() broadcast every changed row to
// every subscriber with table-level SELECT, regardless of row-level policies) needs to `SET ROLE`
// to a subscriber's own project role from a PG_POOL connection (which authenticates as
// baas_admin) before re-running the row's visibility check under that role's RLS policies.
// Postgres only allows SET ROLE to a role you're a member of, so baas_admin needs membership in
// every project's anon/authenticated/service_role roles, not just the platform-global ones.
//
// This grants no new privilege over project data: baas_admin already has unrestricted SQL access
// to every project schema via the SQL console (BYPASSRLS, CREATEROLE), same reasoning as
// 1785200000000_grant-service-role-table-privileges.ts's backfill for service_role's own table
// grants. Mirrors that migration's loop-over-platform.projects shape, with one addition: PG16
// only lets a CREATEROLE holder grant/revoke membership in a role it actually created (or has an
// explicit ADMIN OPTION on) -- baas_admin created every per-project role (provisionAndInsert), so
// those grant cleanly, but the original "default" project (scope.md §23's "pre-existing project
// listed first") reuses the platform-global anon/authenticated/service_role roles verbatim,
// which were created by the bootstrap superuser (packages/database-bootstrap/sql/
// 001_roles.sql.template), not baas_admin -- baas_admin has no ADMIN OPTION on those three and
// this migration cannot grant them (a migration always runs as baas_admin, never superuser). Each
// grant is therefore attempted individually and skipped with a NOTICE, rather than the whole
// migration aborting, when baas_admin lacks ADMIN OPTION on that specific role. Fresh installs
// don't hit this at all: 001_roles.sql.template now grants these three to baas_admin at bootstrap
// time, same as it already does for authenticator. An operator upgrading an existing install
// (where bootstrap won't re-run) needs one manual superuser step to close this for the default
// project specifically:
//   GRANT anon, authenticated, service_role TO baas_admin;
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $do$
    DECLARE
      proj RECORD;
      role_name TEXT;
    BEGIN
      FOR proj IN SELECT anon_role, authenticated_role, service_role_role FROM platform.projects LOOP
        FOREACH role_name IN ARRAY ARRAY[proj.anon_role, proj.authenticated_role, proj.service_role_role]
        LOOP
          IF pg_has_role('baas_admin', role_name, 'MEMBER WITH ADMIN OPTION') THEN
            EXECUTE format('GRANT %I TO baas_admin', role_name);
          ELSE
            RAISE NOTICE 'Skipping GRANT % TO baas_admin -- baas_admin lacks ADMIN OPTION on it '
              '(likely a pre-existing global role from bootstrap, e.g. the default project). '
              'Run this once as the Postgres superuser: GRANT %I TO baas_admin;', role_name, role_name;
          END IF;
        END LOOP;
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
      role_name TEXT;
    BEGIN
      FOR proj IN SELECT anon_role, authenticated_role, service_role_role FROM platform.projects LOOP
        FOREACH role_name IN ARRAY ARRAY[proj.anon_role, proj.authenticated_role, proj.service_role_role]
        LOOP
          IF pg_has_role('baas_admin', role_name, 'MEMBER WITH ADMIN OPTION') THEN
            EXECUTE format('REVOKE %I FROM baas_admin', role_name);
          END IF;
        END LOOP;
      END LOOP;
    END
    $do$;
  `);
}
