import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { importPKCS8, importSPKI, jwtVerify, KeyLike, SignJWT } from 'jose';
import { EnvConfig } from '../../config/env.schema';
import { AppAccessTokenClaims } from './auth.types';

const ISSUER = 'personal-baas';
const AUDIENCE = 'authenticated';
const ALG = 'EdDSA';
// API keys (Phase 4.4) are long-lived, stable credentials by design (publishable/secret keys
// meant to be pasted into a client's config once) rather than short-lived session tokens —
// 10 years is "effectively non-expiring" without special-casing a missing `exp` claim.
const API_KEY_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;

@Injectable()
export class AuthJwtService implements OnModuleInit {
  private readonly logger = new Logger(AuthJwtService.name);
  private privateKey!: KeyLike;
  private publicKey!: KeyLike;
  private accessTokenTtlSeconds!: number;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async onModuleInit(): Promise<void> {
    const privatePem = Buffer.from(
      this.config.get('AUTH_JWT_PRIVATE_KEY_BASE64', { infer: true }),
      'base64',
    ).toString('utf8');
    const publicPem = Buffer.from(
      this.config.get('AUTH_JWT_PUBLIC_KEY_BASE64', { infer: true }),
      'base64',
    ).toString('utf8');

    this.privateKey = await importPKCS8(privatePem, ALG);
    this.publicKey = await importSPKI(publicPem, ALG);
    this.accessTokenTtlSeconds = this.config.get('AUTH_ACCESS_TOKEN_TTL_SECONDS', { infer: true });
    this.logger.log('Loaded application JWT signing keypair');
  }

  async signAccessToken(claims: AppAccessTokenClaims): Promise<string> {
    return new SignJWT({
      role: claims.role,
      email: claims.email,
      session_id: claims.sessionId,
      project_id: claims.projectId,
    })
      .setProtectedHeader({ alg: ALG })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTokenTtlSeconds}s`)
      .sign(this.privateKey);
  }

  // `kid` points back to the platform.api_keys row so revocation can be enforced via
  // PostgREST's db-pre-request hook (platform.check_api_key_revocation) — there's no `sub` or
  // `email` here since a publishable/secret key isn't tied to an application user. `role` is
  // the caller's already-resolved project-scoped role name (e.g. `anon`/`anon_<slug>`,
  // `service_role`/`service_role_<slug>`) — never string-concatenated here, since the seeded
  // project's roles are the legacy unsuffixed names (scope.md §23).
  async signApiKeyToken(role: string, kid: string, projectId: string): Promise<string> {
    return new SignJWT({ role, kid, project_id: projectId })
      .setProtectedHeader({ alg: ALG })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${API_KEY_TTL_SECONDS}s`)
      .sign(this.privateKey);
  }

  // Verifies a publishable/secret API-key token (see signApiKeyToken) — used by
  // ApiKeyBearerGuard to resolve which project a pre-login request (signup/login/refresh)
  // targets (scope.md §23 point 5). Revocation is checked separately against
  // platform.api_keys by the guard, since a still-validly-signed JWT says nothing about
  // whether it's since been revoked.
  async verifyApiKeyToken(
    token: string,
  ): Promise<{ role: string; kid: string; projectId: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      if (
        typeof payload.role !== 'string' ||
        typeof payload.kid !== 'string' ||
        typeof payload.project_id !== 'string'
      ) {
        return null;
      }
      return { role: payload.role, kid: payload.kid, projectId: payload.project_id };
    } catch {
      return null;
    }
  }

  async verifyAccessToken(token: string): Promise<AppAccessTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.role !== 'string' ||
        typeof payload.email !== 'string' ||
        typeof payload.session_id !== 'string' ||
        typeof payload.project_id !== 'string'
      ) {
        return null;
      }
      return {
        sub: payload.sub,
        role: payload.role,
        email: payload.email,
        sessionId: payload.session_id,
        projectId: payload.project_id,
      };
    } catch {
      return null;
    }
  }
}
