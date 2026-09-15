import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export interface AuthUserRow {
  id: string;
  project_id: string;
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

  async findByEmail(email: string, projectId: string): Promise<AuthUserRow | null> {
    const { rows } = await this.pool.query<AuthUserRow>(
      'SELECT * FROM auth.users WHERE project_id = $1 AND lower(email) = lower($2)',
      [projectId, email],
    );
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<AuthUserRow | null> {
    const { rows } = await this.pool.query<AuthUserRow>('SELECT * FROM auth.users WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async create(email: string, passwordHash: string, projectId: string): Promise<AuthUserRow> {
    const { rows } = await this.pool.query<AuthUserRow>(
      `INSERT INTO auth.users (email, password_hash, project_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [email, passwordHash, projectId],
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

  async list(
    search: string | null,
    limit: number,
    offset: number,
    projectId: string,
    // Optional, additive filter (scope.md §36 point 4) — undefined/null preserves every existing
    // caller's behavior (AdminUsersController.list() doesn't pass it).
    status?: 'active' | 'disabled' | 'invited' | null,
  ): Promise<{ rows: AuthUserRow[]; total: number }> {
    const { rows } = await this.pool.query<AuthUserRow>(
      `SELECT * FROM auth.users
       WHERE project_id = $1
         AND ($2::text IS NULL OR email ILIKE '%' || $2 || '%')
         AND ($5::text IS NULL OR status = $5)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [projectId, search, limit, offset, status ?? null],
    );
    const { rows: countRows } = await this.pool.query<{ count: string }>(
      `SELECT count(*) FROM auth.users
       WHERE project_id = $1
         AND ($2::text IS NULL OR email ILIKE '%' || $2 || '%')
         AND ($3::text IS NULL OR status = $3)`,
      [projectId, search, status ?? null],
    );
    return { rows, total: Number(countRows[0].count) };
  }
}
