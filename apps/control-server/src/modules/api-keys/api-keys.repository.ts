import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export interface ApiKeyRow {
  id: string;
  name: string;
  kind: 'publishable' | 'secret';
  created_at: Date;
  created_by: string;
  revoked_at: Date | null;
  revoked_by: string | null;
}

@Injectable()
export class ApiKeysRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(name: string, kind: 'publishable' | 'secret', createdBy: string): Promise<ApiKeyRow> {
    const { rows } = await this.pool.query<ApiKeyRow>(
      `INSERT INTO platform.api_keys (name, kind, created_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, kind, createdBy],
    );
    return rows[0];
  }

  async list(): Promise<ApiKeyRow[]> {
    const { rows } = await this.pool.query<ApiKeyRow>(
      'SELECT * FROM platform.api_keys ORDER BY created_at DESC',
    );
    return rows;
  }

  async findById(id: string): Promise<ApiKeyRow | null> {
    const { rows } = await this.pool.query<ApiKeyRow>('SELECT * FROM platform.api_keys WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async revoke(id: string, revokedBy: string): Promise<ApiKeyRow | null> {
    const { rows } = await this.pool.query<ApiKeyRow>(
      `UPDATE platform.api_keys
       SET revoked_at = now(), revoked_by = $2
       WHERE id = $1 AND revoked_at IS NULL
       RETURNING *`,
      [id, revokedBy],
    );
    return rows[0] ?? null;
  }
}
