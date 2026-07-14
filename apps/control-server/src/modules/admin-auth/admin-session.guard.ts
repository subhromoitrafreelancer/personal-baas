import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { ADMIN_SESSION_COOKIE } from './constants';
import { RequestWithAdmin } from './admin.types';

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly adminAuth: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAdmin>();
    const token: unknown = request.cookies?.[ADMIN_SESSION_COOKIE];
    if (typeof token !== 'string') {
      throw new UnauthorizedException('Admin session required');
    }

    const admin = await this.adminAuth.verifySessionToken(token);
    if (!admin) {
      throw new UnauthorizedException('Admin session required');
    }

    request.admin = admin;
    return true;
  }
}
