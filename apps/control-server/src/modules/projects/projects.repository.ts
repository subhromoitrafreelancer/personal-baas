import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  schema_name: string;
  anon_role: string;
  authenticated_role: string;
  service_role_role: string;
  created_at: Date;
  updated_at: Date;
}

export interface InsertProjectInput {
  slug: string;
  name: string;
  schemaName: string;
  anonRole: string;
  authenticatedRole: string;
  serviceRoleRole: string;
}

@Injectable()
export class ProjectsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findBySlug(slug: string): Promise<ProjectRow | null> {
    const { rows } = await this.pool.query<ProjectRow>(
      'SELECT * FROM platform.projects WHERE slug = $1',
      [slug],
    );
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<ProjectRow | null> {
    const { rows } = await this.pool.query<ProjectRow>(
      'SELECT * FROM platform.projects WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  }

  async insert(input: InsertProjectInput): Promise<ProjectRow> {
    const { rows } = await this.pool.query<ProjectRow>(
      `INSERT INTO platform.projects
         (slug, name, schema_name, anon_role, authenticated_role, service_role_role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.slug,
        input.name,
        input.schemaName,
        input.anonRole,
        input.authenticatedRole,
        input.serviceRoleRole,
      ],
    );
    return rows[0];
  }

  async list(): Promise<ProjectRow[]> {
    const { rows } = await this.pool.query<ProjectRow>(
      'SELECT * FROM platform.projects ORDER BY created_at ASC',
    );
    return rows;
  }

  async schemaExists(schemaName: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT FROM information_schema.schemata WHERE schema_name = $1) AS exists',
      [schemaName],
    );
    return rows[0].exists;
  }

  /**
   * Creates a project's schema, its three project-scoped roles, and its platform.projects row
   * in a single transaction (scope.md §23). Postgres DDL — CREATE SCHEMA, CREATE ROLE, GRANT —
   * is transactional, so if any statement fails (including the final row insert), everything
   * rolls back rather than leaving an orphaned schema/roles with no tracking row, or a tracking
   * row pointing at a schema that only partially exists. The PostgREST config-file rewrite
   * (ProjectsService.create, after this call) stays outside — a file write can't participate in
   * a DB transaction — and keeps its existing manual-restart posture.
   *
   * Names are only ever produced by ProjectsService.create() from an already-validated slug
   * (`^[a-z][a-z0-9_]{2,30}$`), so they're safe to interpolate directly into DDL identifiers —
   * schema/role names can't be bound as query parameters in Postgres DDL.
   */
  async provisionAndInsert(
    names: {
      schemaName: string;
      anonRole: string;
      authenticatedRole: string;
      serviceRoleRole: string;
    },
    input: InsertProjectInput,
  ): Promise<ProjectRow> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`CREATE SCHEMA "${names.schemaName}" AUTHORIZATION baas_admin`);
      await client.query(`
        DO $do$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${names.anonRole}') THEN
            CREATE ROLE "${names.anonRole}" NOLOGIN;
          END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${names.authenticatedRole}') THEN
            CREATE ROLE "${names.authenticatedRole}" NOLOGIN;
          END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${names.serviceRoleRole}') THEN
            CREATE ROLE "${names.serviceRoleRole}" NOLOGIN BYPASSRLS;
          END IF;
        END
        $do$;
      `);
      await client.query(
        `GRANT "${names.anonRole}", "${names.authenticatedRole}", "${names.serviceRoleRole}" TO authenticator`,
      );
      // Schemas created with CREATE SCHEMA get no implicit PUBLIC grant in Postgres — USAGE on
      // a schema is a prerequisite for any table-level grant or schema-qualified function call
      // to mean anything, and is not itself row/table access (scope.md §9: "anon: No access
      // unless explicitly granted"). The global anon/authenticated/service_role roles needed
      // this same grant for `api`/`auth`/`platform` (1784200001000_grant-schema-usage.ts,
      // 1784300002000_grant-platform-schema-usage.ts — both discovered via live "permission
      // denied for schema ..." failures through PostgREST); project-scoped roles need the exact
      // same three, found the same way via a live PR7.5 integration test:
      //   - their own schema, or every table grant inside it is inert
      //   - `platform`, since PGRST_DB_PRE_REQUEST (platform.check_api_key_revocation) runs
      //     before every single PostgREST request regardless of role
      //   - `auth`, so their own RLS policies can use the auth.uid() ergonomic helper
      //     (1784200000000_create-auth-uid-function.ts) like the default project's can
      await client.query(
        `GRANT USAGE ON SCHEMA "${names.schemaName}", platform, auth TO "${names.anonRole}", "${names.authenticatedRole}", "${names.serviceRoleRole}"`,
      );

      // service_role_<slug> is created BYPASSRLS above, but BYPASSRLS only skips row-security
      // *policy* evaluation — Postgres still enforces the base table-privilege check regardless,
      // so without an explicit grant it can see nothing at all (confirmed live: every existing
      // project's service_role had zero table grants, making the OpenAPI spec and REST API both
      // silently empty of tables for it — db-explorer.service.ts's getOpenapiSpec authenticates
      // as exactly this role). baas_admin is the only role that ever creates tables in a project
      // schema (control-server's DATABASE_URL, including the SQL console), so setting its default
      // privileges here means every future CREATE TABLE/SEQUENCE in this schema automatically
      // grants full access to the project's own service_role, matching what BYPASSRLS already
      // implies it should have. anon/authenticated are deliberately NOT included — their access
      // stays explicit-only via the RLS snippet library (scope.md §9).
      await client.query(`
        ALTER DEFAULT PRIVILEGES FOR ROLE baas_admin IN SCHEMA "${names.schemaName}"
          GRANT ALL ON TABLES TO "${names.serviceRoleRole}"
      `);
      await client.query(`
        ALTER DEFAULT PRIVILEGES FOR ROLE baas_admin IN SCHEMA "${names.schemaName}"
          GRANT ALL ON SEQUENCES TO "${names.serviceRoleRole}"
      `);

      const { rows } = await client.query<ProjectRow>(
        `INSERT INTO platform.projects
           (slug, name, schema_name, anon_role, authenticated_role, service_role_role)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          input.slug,
          input.name,
          input.schemaName,
          input.anonRole,
          input.authenticatedRole,
          input.serviceRoleRole,
        ],
      );

      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}
