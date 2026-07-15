import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { StorageBucketRow } from './storage.types';

@Injectable()
export class StorageBucketsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(name: string, isPublic: boolean, sizeLimitBytes: number | null): Promise<StorageBucketRow> {
    const { rows } = await this.pool.query<StorageBucketRow>(
      `INSERT INTO storage.buckets (name, public, size_limit_bytes)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, isPublic, sizeLimitBytes],
    );
    return rows[0];
  }

  async list(): Promise<StorageBucketRow[]> {
    const { rows } = await this.pool.query<StorageBucketRow>(
      'SELECT * FROM storage.buckets ORDER BY created_at DESC',
    );
    return rows;
  }

  async findByName(name: string): Promise<StorageBucketRow | null> {
    const { rows } = await this.pool.query<StorageBucketRow>(
      'SELECT * FROM storage.buckets WHERE name = $1',
      [name],
    );
    return rows[0] ?? null;
  }
}
