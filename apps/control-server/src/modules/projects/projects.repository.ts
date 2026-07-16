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
}
