import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export interface AuthRefreshTokenRow {
  id: string;
  session_id: string;
  token_hash: string;
  family_id: string;
  parent_token_id: string | null;
  issued_at: Date;
  expires_at: Date;
  consumed_at: Date | null;
  revoked_at: Date | null;
}

@Injectable()
export class AuthRefreshTokensRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(
    sessionId: string,
    tokenHash: string,
    familyId: string,
    parentTokenId: string | null,
    expiresAt: Date,
  ): Promise<AuthRefreshTokenRow> {
    const { rows } = await this.pool.query<AuthRefreshTokenRow>(
      `INSERT INTO auth.refresh_tokens (session_id, token_hash, family_id, parent_token_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [sessionId, tokenHash, familyId, parentTokenId, expiresAt],
    );
    return rows[0];
  }
}
