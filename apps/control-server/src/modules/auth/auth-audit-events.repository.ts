import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export interface AuthAuditEventRow {
  id: string;
  user_id: string | null;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  user_email?: string | null;
}

@Injectable()
export class AuthAuditEventsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(
    userId: string | null,
    eventType: string,
    ipAddress: string | null,
    userAgent: string | null,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.audit_events (user_id, event_type, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, eventType, ipAddress, userAgent, metadata],
    );
  }

  // Backs the login-lockout check (scope.md §31 point 4) — counts recent auth.login_failed
  // events for one email, independent of the in-memory request-rate throttle, so a slow brute
  // force spread out under that throttle's own window still gets caught. Filters event_type/
  // created_at first (both indexed) before the metadata->>'email' comparison, so this stays cheap
  // even without a dedicated jsonb index at this platform's expected event volume.
  async countRecentByEmail(
    email: string,
    eventType: string,
    windowMinutes: number,
  ): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      `SELECT count(*) FROM auth.audit_events
       WHERE event_type = $1
         AND created_at > now() - ($2 || ' minutes')::interval
         AND metadata->>'email' = $3`,
      [eventType, windowMinutes, email.toLowerCase()],
    );
    return Number(rows[0].count);
  }

  async list(limit: number, offset: number): Promise<{ rows: AuthAuditEventRow[]; total: number }> {
    const { rows } = await this.pool.query<AuthAuditEventRow>(
      `SELECT ae.*, u.email AS user_email
       FROM auth.audit_events ae
       LEFT JOIN auth.users u ON u.id = ae.user_id
       ORDER BY ae.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    const { rows: countRows } = await this.pool.query<{ count: string }>(
      'SELECT count(*) FROM auth.audit_events',
    );
    return { rows, total: Number(countRows[0].count) };
  }
}
