import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
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

// Every method accepts an optional client so RefreshService can run the whole
// lookup/consume/successor-insert sequence on one checked-out connection inside a single
// transaction (see RefreshService.refresh) — defaults to the shared pool for callers that
// don't need that (there are none left, but this keeps the repo usable standalone).
type Queryable = Pool | PoolClient;

@Injectable()
export class AuthRefreshTokensRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(
    sessionId: string,
    tokenHash: string,
    familyId: string,
    parentTokenId: string | null,
    expiresAt: Date,
    db: Queryable = this.pool,
  ): Promise<AuthRefreshTokenRow> {
    const { rows } = await db.query<AuthRefreshTokenRow>(
      `INSERT INTO auth.refresh_tokens (session_id, token_hash, family_id, parent_token_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [sessionId, tokenHash, familyId, parentTokenId, expiresAt],
    );
    return rows[0];
  }

  async findByHash(tokenHash: string, db: Queryable = this.pool): Promise<AuthRefreshTokenRow | null> {
    const { rows } = await db.query<AuthRefreshTokenRow>(
      'SELECT * FROM auth.refresh_tokens WHERE token_hash = $1',
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  // Conditional consume: the WHERE clause is the actual concurrency control. Postgres takes a
  // row lock on the first UPDATE to reach this row; a second concurrent call blocks until the
  // first commits, then finds consumed_at already set and matches zero rows. Returning null in
  // that case is how the caller detects reuse, instead of the old read-then-blind-write pattern
  // where both concurrent callers could observe "not yet consumed" and both mint a successor.
  async markConsumed(id: string, db: Queryable = this.pool): Promise<AuthRefreshTokenRow | null> {
    const { rows } = await db.query<AuthRefreshTokenRow>(
      `UPDATE auth.refresh_tokens
       SET consumed_at = now()
       WHERE id = $1 AND consumed_at IS NULL AND revoked_at IS NULL
       RETURNING *`,
      [id],
    );
    return rows[0] ?? null;
  }

  // Reuse of an already-consumed or revoked token indicates the token was likely stolen
  // (scope.md §7 family_id/parent_token_id design) — revoke every token in the family so the
  // legitimate holder is forced to re-authenticate rather than silently keep trusting it.
  async revokeFamily(familyId: string, db: Queryable = this.pool): Promise<void> {
    await db.query(
      'UPDATE auth.refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
      [familyId],
    );
  }
}
