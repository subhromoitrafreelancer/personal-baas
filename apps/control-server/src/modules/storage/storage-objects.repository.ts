import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { StorageObjectRow } from './storage.types';

@Injectable()
export class StorageObjectsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // Upsert-on-path: re-uploading to the same bucket+path overwrites, matching the MinIO
  // put behaviour underneath (same key, new bytes).
  async upsert(params: {
    bucketId: string;
    path: string;
    owner: string | null;
    size: number;
    contentType: string | null;
  }): Promise<StorageObjectRow> {
    const { rows } = await this.pool.query<StorageObjectRow>(
      `INSERT INTO storage.objects (bucket_id, path, owner, size, content_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (bucket_id, path)
       DO UPDATE SET owner = EXCLUDED.owner, size = EXCLUDED.size,
         content_type = EXCLUDED.content_type, created_at = now()
       RETURNING *`,
      [params.bucketId, params.path, params.owner, params.size, params.contentType],
    );
    return rows[0];
  }

  async findByBucketAndPath(bucketId: string, path: string): Promise<StorageObjectRow | null> {
    const { rows } = await this.pool.query<StorageObjectRow>(
      'SELECT * FROM storage.objects WHERE bucket_id = $1 AND path = $2',
      [bucketId, path],
    );
    return rows[0] ?? null;
  }

  async listByBucket(bucketId: string): Promise<StorageObjectRow[]> {
    const { rows } = await this.pool.query<StorageObjectRow>(
      'SELECT * FROM storage.objects WHERE bucket_id = $1 ORDER BY path',
      [bucketId],
    );
    return rows;
  }

  async delete(bucketId: string, path: string): Promise<StorageObjectRow | null> {
    const { rows } = await this.pool.query<StorageObjectRow>(
      'DELETE FROM storage.objects WHERE bucket_id = $1 AND path = $2 RETURNING *',
      [bucketId, path],
    );
    return rows[0] ?? null;
  }
}
