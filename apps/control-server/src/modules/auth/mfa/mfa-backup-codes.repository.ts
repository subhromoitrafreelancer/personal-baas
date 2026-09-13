import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { MfaBackupCodeRow } from './mfa.types';

@Injectable()
export class MfaBackupCodesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async insertBatch(userId: string, codeHashes: string[]): Promise<void> {
    const values = codeHashes.map((_, i) => `($1, $${i + 2})`).join(', ');
    await this.pool.query(
      `INSERT INTO auth.mfa_backup_codes (user_id, code_hash) VALUES ${values}`,
      [userId, ...codeHashes],
    );
  }

  async findUnusedByUserId(userId: string): Promise<MfaBackupCodeRow[]> {
    const { rows } = await this.pool.query<MfaBackupCodeRow>(
      'SELECT * FROM auth.mfa_backup_codes WHERE user_id = $1 AND used_at IS NULL',
      [userId],
    );
    return rows;
  }

  async markUsed(id: string): Promise<void> {
    await this.pool.query('UPDATE auth.mfa_backup_codes SET used_at = now() WHERE id = $1', [id]);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM auth.mfa_backup_codes WHERE user_id = $1', [userId]);
  }
}
