import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { HostingSiteFileRow } from './hosting.types';

export interface HostingFileInput {
  path: string;
  size: number;
  contentType: string | null;
}

@Injectable()
export class HostingSiteFilesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listBySite(siteId: string): Promise<HostingSiteFileRow[]> {
    const { rows } = await this.pool.query<HostingSiteFileRow>(
      'SELECT * FROM hosting.site_files WHERE site_id = $1 ORDER BY path',
      [siteId],
    );
    return rows;
  }

  async findBySiteAndPath(siteId: string, path: string): Promise<HostingSiteFileRow | null> {
    const { rows } = await this.pool.query<HostingSiteFileRow>(
      'SELECT * FROM hosting.site_files WHERE site_id = $1 AND path = $2',
      [siteId, path],
    );
    return rows[0] ?? null;
  }

  // Full-replace deploy (scope.md §25 point 3: "not an incremental diff"), transactional so a
  // reader never observes a half-replaced file list. Same BEGIN/COMMIT/ROLLBACK-with-client.release
  // pattern as ProjectsRepository.provisionAndInsert — the only other multi-statement write
  // transaction in this codebase.
  async replaceAll(siteId: string, files: HostingFileInput[]): Promise<HostingSiteFileRow[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM hosting.site_files WHERE site_id = $1', [siteId]);

      const rows: HostingSiteFileRow[] = [];
      for (const file of files) {
        const { rows: inserted } = await client.query<HostingSiteFileRow>(
          `INSERT INTO hosting.site_files (site_id, path, size, content_type)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [siteId, file.path, file.size, file.contentType],
        );
        rows.push(inserted[0]);
      }

      await client.query('COMMIT');
      return rows;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}
