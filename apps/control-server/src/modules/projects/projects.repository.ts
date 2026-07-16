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
   * Creates a project's schema and its three project-scoped roles, granted to
   * `authenticator` (scope.md §23). Names are only ever produced by
   * ProjectsService.create() from an already-validated slug (`^[a-z][a-z0-9_]{2,30}$`), so
   * they're safe to interpolate directly into DDL identifiers — schema/role names can't be
   * bound as query parameters in Postgres DDL.
   */
  async provisionSchemaAndRoles(names: {
    schemaName: string;
    anonRole: string;
    authenticatedRole: string;
    serviceRoleRole: string;
  }): Promise<void> {
    await this.pool.query(`CREATE SCHEMA "${names.schemaName}" AUTHORIZATION baas_admin`);
    await this.pool.query(`
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
    await this.pool.query(
      `GRANT "${names.anonRole}", "${names.authenticatedRole}", "${names.serviceRoleRole}" TO authenticator`,
    );
  }
}
