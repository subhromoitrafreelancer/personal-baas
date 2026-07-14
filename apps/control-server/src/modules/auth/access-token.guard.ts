import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthJwtService } from './auth-jwt.service';
import { RequestWithUser } from './auth.types';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly jwt: AuthJwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Access token required');
    }

    const claims = await this.jwt.verifyAccessToken(header.slice('Bearer '.length));
    if (!claims) {
      throw new UnauthorizedException('Access token required');
    }

    request.user = claims;
    return true;
  }
}
