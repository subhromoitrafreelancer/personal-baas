import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { EnvConfig } from '../../config/env.schema';
import { PG_POOL } from '../database/database.module';
import { ProjectsService } from '../projects/projects.service';
import { AuthAuditService } from './auth-audit.service';
import { AuthJwtService } from './auth-jwt.service';
import { AuthRefreshTokenRow, AuthRefreshTokensRepository } from './auth-refresh-tokens.repository';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { AuthUsersRepository } from './auth-users.repository';
import { generateRefreshToken, hashRefreshToken } from './refresh-token.util';

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  tokenType: 'bearer';
  expiresIn: number;
}

@Injectable()
export class RefreshService {
  private readonly logger = new Logger(RefreshService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly usersRepo: AuthUsersRepository,
    private readonly sessionsRepo: AuthSessionsRepository,
    private readonly refreshTokensRepo: AuthRefreshTokensRepository,
    private readonly jwt: AuthJwtService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly audit: AuthAuditService,
    private readonly projects: ProjectsService,
  ) {}

  async refresh(rawToken: string, ipAddress: string | null, userAgent: string | null): Promise<RefreshResult> {
    const tokenHash = hashRefreshToken(rawToken);

    // Lookup, conditional consume, and successor insert run on one checked-out connection
    // inside a single transaction, so a failure after consuming (e.g. the successor insert
    // fails) rolls the consume back too, instead of stranding a consumed token with no
    // successor. The concurrency-safety itself comes from markConsumed's conditional
    // UPDATE ... RETURNING, not from the transaction boundary alone.
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const token = await this.refreshTokensRepo.findByHash(tokenHash, client);
      if (!token) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (token.expires_at.getTime() < Date.now()) {
        throw new UnauthorizedException('Refresh token expired');
      }

      const consumed = await this.refreshTokensRepo.markConsumed(token.id, client);
      if (!consumed) {
        // Another request already consumed or revoked this token between our read above and
        // the atomic consume attempt just now — treat as reuse (scope.md §7).
        await this.handleReuse(token, ipAddress, userAgent);
        throw new UnauthorizedException('Refresh token reuse detected; session revoked');
      }

      const session = await this.sessionsRepo.findById(consumed.session_id);
      if (!session || session.revoked_at || session.expires_at.getTime() < Date.now()) {
        throw new UnauthorizedException('Session is no longer valid');
      }

      const user = await this.usersRepo.findById(session.user_id);
      if (!user || user.status !== 'active') {
        throw new UnauthorizedException('Session is no longer valid');
      }

      const refreshTtlDays = this.config.get('AUTH_REFRESH_TOKEN_TTL_DAYS', { infer: true });
      const slidingExpiry = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000);
      // Refresh tokens slide forward on each rotation, but never past the session's own
      // absolute expiry — otherwise a continually-refreshed session would never truly end.
      const newExpiresAt = slidingExpiry < session.expires_at ? slidingExpiry : session.expires_at;

      const newRawToken = generateRefreshToken();
      await this.refreshTokensRepo.create(
        session.id,
        hashRefreshToken(newRawToken),
        consumed.family_id,
        consumed.id,
        newExpiresAt,
        client,
      );

      await client.query('COMMIT');

      // The user row already carries which project it belongs to (Phase 9 PR3) — unlike
      // signup/login, refresh never needs to *resolve* a project, only look up the one the
      // existing session already belongs to.
      const project = await this.projects.getById(user.project_id);

      const accessToken = await this.jwt.signAccessToken({
        sub: user.id,
        role: project.authenticated_role,
        email: user.email,
        sessionId: session.id,
        projectId: project.id,
      });

      return {
        accessToken,
        refreshToken: newRawToken,
        tokenType: 'bearer',
        expiresIn: this.config.get('AUTH_ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  private async handleReuse(
    token: AuthRefreshTokenRow,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    this.logger.warn({ msg: 'refresh token reuse detected', familyId: token.family_id });
    await this.refreshTokensRepo.revokeFamily(token.family_id);
    await this.sessionsRepo.revoke(token.session_id);
    const session = await this.sessionsRepo.findById(token.session_id);
    this.audit.record(session?.user_id ?? null, 'user.refresh_reuse_detected', ipAddress, userAgent, {
      familyId: token.family_id,
    });
  }
}
