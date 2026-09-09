import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { VaultSecretRow } from './vault.types';

@Injectable()
export class VaultRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // Metadata only — never selects nonce/ciphertext, so there is no code path through this
  // method that could accidentally leak encrypted material into a list response.
  async listMetadata(
    projectId: string,
  ): Promise<Array<{ id: string; name: string; updated_at: Date }>> {
    const { rows } = await this.pool.query<{ id: string; name: string; updated_at: Date }>(
      'SELECT id, name, updated_at FROM vault.secrets WHERE project_id = $1 ORDER BY name',
      [projectId],
    );
    return rows;
  }

  // Scoped to (projectId, name), never name alone — the actual cross-project isolation
  // boundary for the internal resolve endpoint (scope.md §30 point 5), mirroring how
  // functions.functions is looked up (scope.md §26 point 7a).
  async findByProjectAndName(projectId: string, name: string): Promise<VaultSecretRow | null> {
    const { rows } = await this.pool.query<VaultSecretRow>(
      'SELECT * FROM vault.secrets WHERE project_id = $1 AND name = $2',
      [projectId, name],
    );
    return rows[0] ?? null;
  }

  // create and rotate are the same operation: an INSERT ... ON CONFLICT DO UPDATE keyed on the
  // (project_id, name) unique constraint. This is what gives "no rotation history" (scope.md
  // §30 point 1) for free at the SQL level, rather than as an application-level rule that could
  // be bypassed by a future code path.
  async upsert(
    projectId: string,
    name: string,
    nonce: Buffer,
    ciphertext: Buffer,
  ): Promise<{ id: string; name: string; updated_at: Date }> {
    const { rows } = await this.pool.query<{ id: string; name: string; updated_at: Date }>(
      `INSERT INTO vault.secrets (project_id, name, nonce, ciphertext)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, name)
       DO UPDATE SET nonce = $3, ciphertext = $4, updated_at = now()
       RETURNING id, name, updated_at`,
      [projectId, name, nonce, ciphertext],
    );
    return rows[0];
  }

  async deleteById(id: string, projectId: string): Promise<{ id: string; name: string } | null> {
    const { rows } = await this.pool.query<{ id: string; name: string }>(
      'DELETE FROM vault.secrets WHERE id = $1 AND project_id = $2 RETURNING id, name',
      [id, projectId],
    );
    return rows[0] ?? null;
  }
}
