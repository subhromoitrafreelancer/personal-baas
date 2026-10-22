import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

@Injectable()
export class WorkerRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}
  async authenticate(hash: string): Promise<string | null> {
    const { rows } = await this.pool.query(
      'SELECT id FROM platform.worker_integrations WHERE credential_hash=$1 AND enabled',
      [hash],
    );
    return rows[0]?.id ?? null;
  }
  async projects(integration: string) {
    const { rows } = await this.pool.query(
      `SELECT p.id, p.slug, p.schema_name
      FROM platform.projects p JOIN platform.worker_project_grants g ON g.project_id=p.id
      JOIN platform.worker_integrations i ON i.id=g.integration_id
      WHERE i.id=$1 AND i.enabled AND g.enabled ORDER BY p.id`,
      [integration],
    );
    return rows;
  }
  // Lock the integration then grant in a consistent order. Disable operations serialize with
  // mint/renew/resolve and cannot leave a newly-created key alive after revocation commits.
  async authorized<T>(
    integration: string,
    project: string | null,
    lease: string | null,
    operation: (
      db: PoolClient,
      grant: { id: string; project_id: string; allowed_secret_names: string[] },
      existing: { id: string; api_key_id: string } | null,
    ) => Promise<T>,
  ): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const i = await db.query(
        'SELECT id FROM platform.worker_integrations WHERE id=$1 AND enabled FOR UPDATE',
        [integration],
      );
      if (!i.rowCount) throw new NotFoundException('Worker resource unavailable');
      const grants = await db.query(
        `SELECT g.* FROM platform.worker_project_grants g
        WHERE g.integration_id=$1 AND g.enabled AND
          (($2::uuid IS NOT NULL AND g.project_id=$2) OR
           ($3::uuid IS NOT NULL AND g.id=(SELECT grant_id FROM platform.worker_project_leases WHERE id=$3)))
        FOR UPDATE`,
        [integration, project, lease],
      );
      if (!grants.rowCount) throw new NotFoundException('Worker resource unavailable');
      let existing = null;
      if (lease) {
        const result = await db.query(
          `SELECT l.* FROM platform.worker_project_leases l
          JOIN platform.api_keys k ON k.id=l.api_key_id WHERE l.id=$1 AND l.grant_id=$2
          AND l.revoked_at IS NULL AND k.revoked_at IS NULL AND l.expires_at>now() FOR UPDATE OF l,k`,
          [lease, grants.rows[0].id],
        );
        if (!result.rowCount) throw new NotFoundException('Worker resource unavailable');
        existing = result.rows[0];
      }
      const result = await operation(db, grants.rows[0], existing);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
  async register(name: string, hash: string) {
    const { rows } = await this.pool.query(
      `INSERT INTO platform.worker_integrations(name,credential_hash)
      VALUES ($1,$2) RETURNING id,name,enabled`,
      [name, hash],
    );
    return rows[0];
  }
  async grant(integration: string, project: string, names: string[], enabled: boolean) {
    // Same locking order as authorized(), including disabling an existing grant.
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const i = await db.query(
        'SELECT id FROM platform.worker_integrations WHERE id=$1 FOR UPDATE',
        [integration],
      );
      if (!i.rowCount) throw new NotFoundException('Worker resource unavailable');
      const { rows } = await db.query(
        `INSERT INTO platform.worker_project_grants
        (integration_id,project_id,allowed_secret_names,enabled) VALUES ($1,$2,$3,$4)
        ON CONFLICT(integration_id,project_id) DO UPDATE SET allowed_secret_names=$3,enabled=$4,updated_at=now()
        RETURNING id,project_id,enabled,allowed_secret_names`,
        [integration, project, names, enabled],
      );
      await db.query('COMMIT');
      return rows[0];
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
  async disable(integration: string) {
    const { rowCount } = await this.pool.query(
      'UPDATE platform.worker_integrations SET enabled=false WHERE id=$1',
      [integration],
    );
    if (!rowCount) throw new NotFoundException('Worker resource unavailable');
    return { disabled: true };
  }
}
