import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ApiKeysRepository } from '../api-keys/api-keys.repository';
import { isServiceRoleRole, RequestWithServiceKey } from '../storage/storage-access.guard';
import { AuthJwtService } from './auth-jwt.service';

// Guards GET /users/v1/directory (scope.md §36 point 2). Deliberately narrower than
// StorageAccessGuard: only a service_role-scoped API-key JWT is accepted, never a real user's own
// access token — this route is a server-to-server directory read, not something an end user's own
// session should ever reach. project_id comes from the verified token's own claim only, exactly
// like ApiKeyBearerGuard/StorageAccessGuard — a service_role key for project A must never be able
// to name a different project's id anywhere in the request.
@Injectable()
export class ServiceRoleBearerGuard implements CanActivate {
  constructor(
    private readonly jwt: AuthJwtService,
    private readonly apiKeysRepo: ApiKeysRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithServiceKey>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Service-role API key required');
    }

    const claims = await this.jwt.verifyApiKeyToken(header.slice('Bearer '.length));
    if (!claims || !isServiceRoleRole(claims.role)) {
      throw new UnauthorizedException('Service-role API key required');
    }

    const row = await this.apiKeysRepo.findById(claims.kid);
    if (!row || row.revoked_at) {
      throw new UnauthorizedException('API key has been revoked');
    }

    request.serviceKey = { role: claims.role, projectId: claims.projectId };
    return true;
  }
}
