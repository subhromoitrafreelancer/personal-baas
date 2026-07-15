import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export interface AuthSessionRow {
  id: string;
  user_id: string;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  ip_address: string | null;
  user_agent: string | null;
}

@Injectable()
export class AuthSessionsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(
    userId: string,
    expiresAt: Date,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<AuthSessionRow> {
    const { rows } = await this.pool.query<AuthSessionRow>(
      `INSERT INTO auth.sessions (user_id, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, expiresAt, ipAddress, userAgent],
    );
    return rows[0];
  }

  async findById(id: string): Promise<AuthSessionRow | null> {
    const { rows } = await this.pool.query<AuthSessionRow>('SELECT * FROM auth.sessions WHERE id = $1', [
      id,
    ]);
    return rows[0] ?? null;
  }

  async revoke(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE auth.sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
      [id],
    );
  }

  // Used after a password reset: refresh() already checks session.revoked_at on every call
  // (see RefreshService), so revoking every session here is enough to fully lock out anyone
  // still holding an old refresh token — no need to also touch auth.refresh_tokens directly.
  async revokeAllForUser(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE auth.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );
  }
}
