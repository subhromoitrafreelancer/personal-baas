import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { jwtVerify, SignJWT } from 'jose';
import { Pool } from 'pg';
import { EnvConfig } from '../../config/env.schema';
import { PG_POOL } from '../database/database.module';
import { ProjectsService } from '../projects/projects.service';
import { ADMIN_SESSION_TTL_SECONDS } from './constants';
import { AdminIdentity } from './admin.types';

interface AdminRow {
  id: string;
  email: string;
  password_hash: string;
}

@Injectable()
export class AdminAuthService implements OnModuleInit {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly sessionSecret: Uint8Array;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly projectsService: ProjectsService,
  ) {
    this.sessionSecret = new TextEncoder().encode(
      this.config.get('ADMIN_SESSION_SECRET', { infer: true }),
    );
  }

  async onModuleInit(): Promise<void> {
    // Invariant (scope.md §23): an admin is never seeded without at least one project
    // present. Normally a no-op — the projects migration already seeds the default row.
    await this.projectsService.ensureDefaultProject();

    const { rows } = await this.pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM platform.platform_admins',
    );
    if (rows[0].count > 0) {
      return;
    }

    const email = this.config.get('INITIAL_ADMIN_EMAIL', { infer: true });
    const password = this.config.get('INITIAL_ADMIN_PASSWORD', { infer: true });
    if (!email || !password) {
      this.logger.warn(
        'No platform administrator exists yet. Set INITIAL_ADMIN_EMAIL and ' +
          'INITIAL_ADMIN_PASSWORD and restart the control server to create one.',
      );
      return;
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.pool.query(
      'INSERT INTO platform.platform_admins (email, password_hash) VALUES ($1, $2)',
      [email, passwordHash],
    );
    this.logger.log(`Created initial platform administrator: ${email}`);
  }

  async verifyCredentials(email: string, password: string): Promise<AdminIdentity | null> {
    const { rows } = await this.pool.query<AdminRow>(
      'SELECT id, email, password_hash FROM platform.platform_admins WHERE lower(email) = lower($1)',
      [email],
    );
    const admin = rows[0];
    if (!admin) {
      return null;
    }

    const valid = await argon2.verify(admin.password_hash, password);
    if (!valid) {
      return null;
    }

    await this.pool.query('UPDATE platform.platform_admins SET last_login_at = now() WHERE id = $1', [
      admin.id,
    ]);
    return { sub: admin.id, email: admin.email };
  }

  async createSessionToken(admin: AdminIdentity): Promise<string> {
    return new SignJWT({ email: admin.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(admin.sub)
      .setIssuedAt()
      .setExpirationTime(`${ADMIN_SESSION_TTL_SECONDS}s`)
      .sign(this.sessionSecret);
  }

  async verifySessionToken(token: string): Promise<AdminIdentity | null> {
    let sub: string;
    try {
      const { payload } = await jwtVerify(token, this.sessionSecret);
      if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
        return null;
      }
      sub = payload.sub;
    } catch {
      return null;
    }

    // The JWT itself is stateless and long-lived (12h), so a valid signature alone doesn't
    // mean the admin is still allowed in — re-check against platform.platform_admins on every
    // request, mirroring the live revocation check already done for API keys
    // (platform.check_api_key_revocation). Catches both a deleted admin row and an explicit
    // disabled_at lockout.
    const { rows } = await this.pool.query<{ id: string; email: string }>(
      'SELECT id, email FROM platform.platform_admins WHERE id = $1 AND disabled_at IS NULL',
      [sub],
    );
    const admin = rows[0];
    if (!admin) {
      return null;
    }
    return { sub: admin.id, email: admin.email };
  }
}
