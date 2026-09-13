import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { EnvConfig } from '../../config/env.schema';
import { ProjectRow } from '../projects/projects.repository';
import { AuthAuditService } from './auth-audit.service';
import { AuthJwtService } from './auth-jwt.service';
import { AuthRefreshTokensRepository } from './auth-refresh-tokens.repository';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { PublicUser, toPublicUser } from './auth-user.dto';
import { AuthUserRow, AuthUsersRepository } from './auth-users.repository';
import { MfaService } from './mfa/mfa.service';
import { generateRefreshToken, hashRefreshToken } from './refresh-token.util';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  tokenType: 'bearer';
  expiresIn: number;
  user: PublicUser;
}

// Returned instead of LoginResult when the login handshake isn't finished yet (scope.md §33
// point 5b/5c) — mfaToken proves the password step already succeeded and drives whichever of
// the two follow-up calls applies.
export interface MfaChallenge {
  mfaRequired?: true;
  mfaEnrollmentRequired?: true;
  mfaToken: string;
}

export type LoginOutcome = LoginResult | MfaChallenge;

@Injectable()
export class LoginService {
  constructor(
    private readonly usersRepo: AuthUsersRepository,
    private readonly sessionsRepo: AuthSessionsRepository,
    private readonly refreshTokensRepo: AuthRefreshTokensRepository,
    private readonly jwt: AuthJwtService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly audit: AuthAuditService,
    private readonly mfa: MfaService,
  ) {}

  async login(
    email: string,
    password: string,
    ipAddress: string | null,
    userAgent: string | null,
    project: ProjectRow,
  ): Promise<LoginOutcome> {
    // Persistent lockout check (scope.md §31 point 4) — independent of the request-rate
    // throttle on this route, catches a slow brute force spread out under that throttle's own
    // window. Checked before the user lookup, purely on the submitted email, so a locked-out
    // attacker never gets far enough to learn whether the account even exists.
    const recentFailures = await this.audit.countRecentByEmail(
      email,
      'auth.login_failed',
      this.config.get('LOGIN_LOCKOUT_WINDOW_MINUTES', { infer: true }),
    );
    if (recentFailures >= this.config.get('LOGIN_LOCKOUT_THRESHOLD', { infer: true })) {
      throw new HttpException(
        'Too many failed login attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.usersRepo.findByEmail(email, project.id);
    if (!user) {
      this.audit.record(null, 'auth.login_failed', ipAddress, userAgent, {
        email: email.toLowerCase(),
      });
      throw new UnauthorizedException('Invalid login credentials');
    }
    if (user.status === 'disabled') {
      throw new ForbiddenException('This account has been disabled');
    }

    const valid = await argon2.verify(user.password_hash, password);
    if (!valid) {
      this.audit.record(user.id, 'auth.login_failed', ipAddress, userAgent, {
        email: email.toLowerCase(),
      });
      throw new UnauthorizedException('Invalid login credentials');
    }

    // Three-way MFA branch (scope.md §33 point 5), evaluated only on this fresh password login —
    // turning project.mfa_required on never retroactively touches an already-issued session.
    const hasFactor = await this.mfa.hasVerifiedFactor(user.id);
    if (hasFactor) {
      const mfaToken = await this.jwt.signMfaToken(user.id, project.id);
      return { mfaRequired: true, mfaToken };
    }
    if (project.mfa_required) {
      const mfaToken = await this.jwt.signMfaToken(user.id, project.id);
      return { mfaEnrollmentRequired: true, mfaToken };
    }

    return this.issueSession(user, project, ipAddress, userAgent);
  }

  // Extracted so /auth/v1/mfa/verify and /auth/v1/mfa/verify-enrollment (forced mid-login path)
  // can issue a real session through the exact same path a normal password-only login uses,
  // once the MFA step itself succeeds (scope.md §33 point 5b/c).
  async issueSession(
    user: AuthUserRow,
    project: ProjectRow,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<LoginResult> {
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
      role: project.authenticated_role,
      email: user.email,
      sessionId: session.id,
      projectId: project.id,
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
