import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { MfaFactorRow } from './mfa.types';

@Injectable()
export class MfaFactorsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByUserId(userId: string): Promise<MfaFactorRow | null> {
    const { rows } = await this.pool.query<MfaFactorRow>(
      'SELECT * FROM auth.mfa_factors WHERE user_id = $1',
      [userId],
    );
    return rows[0] ?? null;
  }

  // Insert-or-replace — the caller (MfaService.enroll()) is responsible for refusing this when
  // an existing row is already verified (scope.md §33 point 9); this method itself has no
  // opinion, it just writes whatever it's given.
  async upsert(userId: string, nonce: Buffer, ciphertext: Buffer): Promise<MfaFactorRow> {
    const { rows } = await this.pool.query<MfaFactorRow>(
      `INSERT INTO auth.mfa_factors (user_id, secret_nonce, secret_ciphertext, verified)
       VALUES ($1, $2, $3, false)
       ON CONFLICT (user_id) DO UPDATE SET
         secret_nonce = excluded.secret_nonce,
         secret_ciphertext = excluded.secret_ciphertext,
         verified = false,
         verified_at = null
       RETURNING *`,
      [userId, nonce, ciphertext],
    );
    return rows[0];
  }

  async markVerified(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE auth.mfa_factors SET verified = true, verified_at = now() WHERE user_id = $1',
      [userId],
    );
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM auth.mfa_factors WHERE user_id = $1', [userId]);
  }

  async hasVerifiedFactor(userId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'SELECT 1 FROM auth.mfa_factors WHERE user_id = $1 AND verified = true',
      [userId],
    );
    return rows.length > 0;
  }

  // Backs the admin Users page's MFA status column (scope.md §33 point 9) — one batched query
  // per page load rather than joining MFA state into AuthUsersRepository.list() itself, which
  // would leak an MFA-shaped column into every other AuthUserRow consumer including the
  // non-admin /auth/v1/user self-service DTO.
  async findVerifiedUserIds(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) {
      return new Set();
    }
    const { rows } = await this.pool.query<{ user_id: string }>(
      'SELECT user_id FROM auth.mfa_factors WHERE verified = true AND user_id = ANY($1)',
      [userIds],
    );
    return new Set(rows.map((row) => row.user_id));
  }
}
