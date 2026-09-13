import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { importPKCS8, importSPKI, jwtVerify, KeyLike, SignJWT } from 'jose';
import { EnvConfig } from '../../config/env.schema';
import { AppAccessTokenClaims } from './auth.types';

const ISSUER = 'personal-baas';
const AUDIENCE = 'authenticated';
// Distinct audience for the MFA-pending token (Phase 19, scope.md §33 point 5b) — jose's own
// audience check inside jwtVerify() is the structural rejection mechanism that keeps this token
// type from ever being mistaken for a real access token (or vice versa), with no manual
// claim-shape checking needed: verifyAccessToken() below always requires AUDIENCE and so
// rejects an MFA_AUDIENCE token before ever inspecting its claims, and verifyMfaToken()
// always requires MFA_AUDIENCE and so rejects a real access token the same way.
const MFA_AUDIENCE = 'mfa-pending';
const ALG = 'EdDSA';
// Long enough to complete an enroll-then-verify round trip without feeling rushed, short enough
// that a leaked token (e.g. via a referrer header or a logged URL) is a narrow window.
const MFA_TOKEN_TTL_SECONDS = 5 * 60;
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

  // Mints a short-lived token for control-server's own internal-purpose calls to PostgREST —
  // originally the admin-only OpenAPI spec viewer proxy, now also the Scheduler's (Phase 13,
  // scope.md §27 point 3) synthetic service_role identity for a scheduled function's ctx.rest
  // calls. Without one, PostgREST resolves an unauthenticated request to the global anon role,
  // so any table granted only to a project-scoped role (anon_<slug>/authenticated_<slug>/
  // service_role_<slug> — the normal case past the default project, see rls-snippets.js)
  // silently disappears from the spec while functions still show up (implicit PUBLIC EXECUTE).
  // Never handed to a browser/API caller, so it carries no `kid` (nothing to revoke). Default
  // TTL (60s) suits the original sub-second admin-proxy use; the Scheduler passes a TTL derived
  // from the target function's own timeout_ms instead, so a long-running scheduled function's
  // late ctx.rest call can't outlive the token that authorizes it.
  async signInternalRoleToken(role: string, projectId: string, ttlSeconds = 60): Promise<string> {
    return new SignJWT({ role, project_id: projectId })
      .setProtectedHeader({ alg: ALG })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.privateKey);
  }

  // Proves the password step of a login already succeeded, without granting any real access
  // (scope.md §33 point 5b) — carries only enough to drive the two MFA endpoints (verify,
  // enroll/verify-enrollment) that accept it. project_id lets those endpoints resolve the
  // project's own `name` for the TOTP issuer label (point 10) without a second DB round trip.
  async signMfaToken(userId: string, projectId: string): Promise<string> {
    return new SignJWT({ project_id: projectId })
      .setProtectedHeader({ alg: ALG })
      .setIssuer(ISSUER)
      .setAudience(MFA_AUDIENCE)
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${MFA_TOKEN_TTL_SECONDS}s`)
      .sign(this.privateKey);
  }

  async verifyMfaToken(token: string): Promise<{ sub: string; projectId: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        issuer: ISSUER,
        audience: MFA_AUDIENCE,
      });
      if (typeof payload.sub !== 'string' || typeof payload.project_id !== 'string') {
        return null;
      }
      return { sub: payload.sub, projectId: payload.project_id };
    } catch {
      return null;
    }
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
