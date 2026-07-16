import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ApiKeysRepository } from '../api-keys/api-keys.repository';
import { ProjectsService } from '../projects/projects.service';
import { AuthJwtService } from './auth-jwt.service';
import { RequestWithApiKeyProject } from './auth.types';

// Resolves which project a pre-login request (signup/login/token) targets from the
// publishable/secret-key bearer the client is already required to send (scope.md §23 point 5;
// examples/todo-app's js/api.js has sent this on every request, including these three, since
// Phase 7a — this guard is what finally makes the server enforce and use it). A second
// ApiKeysRepository instance is registered directly in AuthModule (not imported from
// ApiKeysModule) since ApiKeysModule already imports AuthModule — importing it back would be
// circular; ApiKeysRepository has no dependencies of its own beyond the global PG_POOL, so a
// second instance is harmless.
@Injectable()
export class ApiKeyBearerGuard implements CanActivate {
  constructor(
    private readonly jwt: AuthJwtService,
    private readonly apiKeysRepo: ApiKeysRepository,
    private readonly projects: ProjectsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithApiKeyProject>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('API key required');
    }

    const claims = await this.jwt.verifyApiKeyToken(header.slice('Bearer '.length));
    if (!claims) {
      throw new UnauthorizedException('Invalid API key');
    }

    const row = await this.apiKeysRepo.findById(claims.kid);
    if (!row || row.revoked_at) {
      throw new UnauthorizedException('API key has been revoked');
    }

    request.apiKeyProject = await this.projects.getById(row.project_id);
    return true;
  }
}
