import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { VaultInvocationTokensService } from './vault-invocation-tokens.service';

export interface RequestWithInvocationProject extends Request {
  invocationProjectId?: string;
}

// Guards POST /internal/vault/resolve — the one endpoint function-runner workers call back into
// (scope.md §30 point 5). Not AdminSessionGuard/AccessTokenGuard: the caller here is a worker
// thread inside function-runner, not an admin or an application user. Trust comes entirely from
// possessing the opaque, single-invocation token control-server itself minted and handed to
// function-runner in the original /run call's ctx — never from network topology alone (see
// VaultInvocationTokensService's own comment for why that doesn't hold for this endpoint).
@Injectable()
export class VaultInvocationTokenGuard implements CanActivate {
  constructor(private readonly tokens: VaultInvocationTokensService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithInvocationProject>();
    const token = req.headers['x-invocation-token'];
    if (typeof token !== 'string' || !token) {
      throw new UnauthorizedException('Missing invocation token');
    }
    const projectId = this.tokens.resolve(token);
    if (!projectId) {
      throw new UnauthorizedException('Invalid or expired invocation token');
    }
    req.invocationProjectId = projectId;
    return true;
  }
}
