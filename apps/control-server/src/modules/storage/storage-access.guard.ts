import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { ApiKeysRepository } from '../api-keys/api-keys.repository';
import { AuthJwtService } from '../auth/auth-jwt.service';
import { RequestWithUser } from '../auth/auth.types';

export interface RequestWithServiceKey extends Request {
  serviceKey?: { role: string; projectId: string };
}

// `service_role` for the seeded default project, `service_role_<slug>` for every other project
// (scope.md §23 point 2) — the only two shapes a real service_role name can take. No other role
// name produced anywhere on this platform ever starts with this prefix.
function isServiceRole(role: string): boolean {
  return role === 'service_role' || role.startsWith('service_role_');
}

// Storage's own object-access guard (scope.md §21 point 4's canRead/canWrite already special-
// case `role === 'service_role'` as an ownership bypass — this is what actually lets a caller
// reach that branch). Accepts either credential AccessTokenGuard alone would reject the second
// of:
//   1. A real application-user session access token (unchanged behavior — same
//      verifyAccessToken() check AccessTokenGuard itself uses).
//   2. A service_role-scoped API-key JWT (minted via /admin/api-keys), revocation-checked
//      against platform.api_keys the same way ApiKeyBearerGuard already does for the pre-login
//      auth endpoints — a signature-valid but revoked key must not pass.
// A publishable/anon-scoped API key is deliberately NOT accepted here: this guard only widens
// storage access for the one credential the service layer already has a bypass branch for,
// nothing else. Every other AccessTokenGuard consumer (Functions, Realtime, /auth/v1/user) is
// untouched by this — this guard is storage-only, a narrower surface than AccessTokenGuard's
// general contract.
@Injectable()
export class StorageAccessGuard implements CanActivate {
  constructor(
    private readonly jwt: AuthJwtService,
    private readonly apiKeysRepo: ApiKeysRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser & RequestWithServiceKey>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Access token required');
    }
    const token = header.slice('Bearer '.length);

    const userClaims = await this.jwt.verifyAccessToken(token);
    if (userClaims) {
      request.user = userClaims;
      return true;
    }

    const apiKeyClaims = await this.jwt.verifyApiKeyToken(token);
    if (apiKeyClaims && isServiceRole(apiKeyClaims.role)) {
      const row = await this.apiKeysRepo.findById(apiKeyClaims.kid);
      if (!row || row.revoked_at) {
        throw new UnauthorizedException('API key has been revoked');
      }
      request.serviceKey = { role: apiKeyClaims.role, projectId: apiKeyClaims.projectId };
      return true;
    }

    throw new UnauthorizedException('Access token required');
  }
}
