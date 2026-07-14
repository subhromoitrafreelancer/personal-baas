import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { EnvConfig } from '../../config/env.schema';
import { AuthAuditService } from './auth-audit.service';
import { AuthJwtService } from './auth-jwt.service';
import { AuthRefreshTokensRepository } from './auth-refresh-tokens.repository';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { PublicUser, toPublicUser } from './auth-user.dto';
import { AuthUsersRepository } from './auth-users.repository';
import { generateRefreshToken, hashRefreshToken } from './refresh-token.util';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  tokenType: 'bearer';
  expiresIn: number;
  user: PublicUser;
}

@Injectable()
export class LoginService {
  constructor(
    private readonly usersRepo: AuthUsersRepository,
    private readonly sessionsRepo: AuthSessionsRepository,
    private readonly refreshTokensRepo: AuthRefreshTokensRepository,
    private readonly jwt: AuthJwtService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly audit: AuthAuditService,
  ) {}

  async login(
    email: string,
    password: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<LoginResult> {
    const user = await this.usersRepo.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid login credentials');
    }
    if (user.status === 'disabled') {
      throw new ForbiddenException('This account has been disabled');
    }

    const valid = await argon2.verify(user.password_hash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid login credentials');
    }

    const refreshTtlDays = this.config.get('AUTH_REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const sessionExpiresAt = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000);
    const session = await this.sessionsRepo.create(user.id, sessionExpiresAt, ipAddress, userAgent);

    const refreshToken = generateRefreshToken();
    await this.refreshTokensRepo.create(
      session.id,
      hashRefreshToken(refreshToken),
      randomUUID(),
      null,
      sessionExpiresAt,
    );

    await this.usersRepo.updateLastSignIn(user.id);

    const accessToken = await this.jwt.signAccessToken({
      sub: user.id,
      role: user.role,
      email: user.email,
      sessionId: session.id,
    });

    this.audit.record(user.id, 'user.login', ipAddress, userAgent, { sessionId: session.id });

    return {
      accessToken,
      refreshToken,
      tokenType: 'bearer',
      expiresIn: this.config.get('AUTH_ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
      user: toPublicUser(user),
    };
  }
}
