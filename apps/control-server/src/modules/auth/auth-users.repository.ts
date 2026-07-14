import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export interface AuthUserRow {
  id: string;
  email: string;
  password_hash: string;
  status: 'active' | 'disabled' | 'invited';
  email_verified: boolean;
  role: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  last_sign_in_at: Date | null;
  password_changed_at: Date | null;
}

@Injectable()
export class AuthUsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<AuthUserRow | null> {
    const { rows } = await this.pool.query<AuthUserRow>(
      'SELECT * FROM auth.users WHERE lower(email) = lower($1)',
      [email],
    );
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<AuthUserRow | null> {
    const { rows } = await this.pool.query<AuthUserRow>('SELECT * FROM auth.users WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async create(email: string, passwordHash: string): Promise<AuthUserRow> {
    const { rows } = await this.pool.query<AuthUserRow>(
      `INSERT INTO auth.users (email, password_hash)
       VALUES ($1, $2)
       RETURNING *`,
      [email, passwordHash],
    );
    return rows[0];
  }

  async updateLastSignIn(id: string): Promise<void> {
    await this.pool.query('UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1', [id]);
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth.users
       SET password_hash = $2, password_changed_at = now(), updated_at = now()
       WHERE id = $1`,
      [id, passwordHash],
    );
  }

  async setStatus(id: string, status: 'active' | 'disabled'): Promise<AuthUserRow | null> {
    const { rows } = await this.pool.query<AuthUserRow>(
      'UPDATE auth.users SET status = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [id, status],
    );
    return rows[0] ?? null;
  }

  async list(search: string | null, limit: number, offset: number): Promise<{ rows: AuthUserRow[]; total: number }> {
    const { rows } = await this.pool.query<AuthUserRow>(
      `SELECT * FROM auth.users
       WHERE $1::text IS NULL OR email ILIKE '%' || $1 || '%'
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [search, limit, offset],
    );
    const { rows: countRows } = await this.pool.query<{ count: string }>(
      `SELECT count(*) FROM auth.users WHERE $1::text IS NULL OR email ILIKE '%' || $1 || '%'`,
      [search],
    );
    return { rows, total: Number(countRows[0].count) };
  }
}
