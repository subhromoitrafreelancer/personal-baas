import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { HostingSiteRow } from './hosting.types';

@Injectable()
export class HostingSitesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByProjectId(projectId: string): Promise<HostingSiteRow | null> {
    const { rows } = await this.pool.query<HostingSiteRow>(
      'SELECT * FROM hosting.sites WHERE project_id = $1',
      [projectId],
    );
    return rows[0] ?? null;
  }

  async create(projectId: string): Promise<HostingSiteRow> {
    const { rows } = await this.pool.query<HostingSiteRow>(
      `INSERT INTO hosting.sites (project_id) VALUES ($1) RETURNING *`,
      [projectId],
    );
    return rows[0];
  }

  // One site per project (hosting.sites.project_id is unique) — a deploy implicitly provisions
  // the site row on first use, no separate "create site" admin step needed (scope.md §25 point
  // 2: "one active deployment per project in v1").
  async findOrCreateByProjectId(projectId: string): Promise<HostingSiteRow> {
    const existing = await this.findByProjectId(projectId);
    if (existing) {
      return existing;
    }
    return this.create(projectId);
  }
}
