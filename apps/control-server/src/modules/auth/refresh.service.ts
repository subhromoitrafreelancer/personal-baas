import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../config/env.schema';
import { AuthJwtService } from './auth-jwt.service';
import { AuthRefreshTokensRepository } from './auth-refresh-tokens.repository';
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
    private readonly usersRepo: AuthUsersRepository,
    private readonly sessionsRepo: AuthSessionsRepository,
    private readonly refreshTokensRepo: AuthRefreshTokensRepository,
    private readonly jwt: AuthJwtService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async refresh(rawToken: string): Promise<RefreshResult> {
    const tokenHash = hashRefreshToken(rawToken);
    const token = await this.refreshTokensRepo.findByHash(tokenHash);
    if (!token) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (token.consumed_at || token.revoked_at) {
      this.logger.warn({ msg: 'refresh token reuse detected', familyId: token.family_id });
      await this.refreshTokensRepo.revokeFamily(token.family_id);
      await this.sessionsRepo.revoke(token.session_id);
      throw new UnauthorizedException('Refresh token reuse detected; session revoked');
    }

    if (token.expires_at.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const session = await this.sessionsRepo.findById(token.session_id);
    if (!session || session.revoked_at || session.expires_at.getTime() < Date.now()) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    const user = await this.usersRepo.findById(session.user_id);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Session is no longer valid');
    }

    await this.refreshTokensRepo.markConsumed(token.id);

    const refreshTtlDays = this.config.get('AUTH_REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const slidingExpiry = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000);
    // Refresh tokens slide forward on each rotation, but never past the session's own
    // absolute expiry — otherwise a continually-refreshed session would never truly end.
    const newExpiresAt = slidingExpiry < session.expires_at ? slidingExpiry : session.expires_at;

    const newRawToken = generateRefreshToken();
    await this.refreshTokensRepo.create(
      session.id,
      hashRefreshToken(newRawToken),
      token.family_id,
      token.id,
      newExpiresAt,
    );

    const accessToken = await this.jwt.signAccessToken({
      sub: user.id,
      role: user.role,
      email: user.email,
      sessionId: session.id,
    });

    return {
      accessToken,
      refreshToken: newRawToken,
      tokenType: 'bearer',
      expiresIn: this.config.get('AUTH_ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
    };
  }
}
