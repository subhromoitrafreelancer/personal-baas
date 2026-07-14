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
}
