import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export interface AuthPasswordResetTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: Date;
  expires_at: Date;
  used_at: Date | null;
}

@Injectable()
export class AuthPasswordResetTokensRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<AuthPasswordResetTokenRow> {
    const { rows } = await this.pool.query<AuthPasswordResetTokenRow>(
      `INSERT INTO auth.password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, tokenHash, expiresAt],
    );
    return rows[0];
  }

  async findByHash(tokenHash: string): Promise<AuthPasswordResetTokenRow | null> {
    const { rows } = await this.pool.query<AuthPasswordResetTokenRow>(
      'SELECT * FROM auth.password_reset_tokens WHERE token_hash = $1',
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  async markUsed(id: string): Promise<void> {
    await this.pool.query('UPDATE auth.password_reset_tokens SET used_at = now() WHERE id = $1', [id]);
  }
}
