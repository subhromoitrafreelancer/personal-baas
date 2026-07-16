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

  async getStats(): Promise<{
    bucketCount: number;
    objectCount: number;
    totalBytes: number;
    emptyBucketCount: number;
  }> {
    const { rows } = await this.pool.query<{
      bucket_count: string;
      object_count: string;
      total_bytes: string;
      empty_bucket_count: string;
    }>(`
      SELECT
        (SELECT count(*) FROM storage.buckets) AS bucket_count,
        (SELECT count(*) FROM storage.objects) AS object_count,
        (SELECT coalesce(sum(size), 0) FROM storage.objects) AS total_bytes,
        (SELECT count(*) FROM storage.buckets b
           WHERE NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = b.id)
        ) AS empty_bucket_count
    `);
    const row = rows[0];
    return {
      bucketCount: Number(row.bucket_count),
      objectCount: Number(row.object_count),
      totalBytes: Number(row.total_bytes),
      emptyBucketCount: Number(row.empty_bucket_count),
    };
  }
}
