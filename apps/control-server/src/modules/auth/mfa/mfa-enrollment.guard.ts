import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthJwtService } from '../auth-jwt.service';

export interface MfaSubject {
  userId: string;
  projectId: string;
  // Lets MfaController tell the two entry points apart post-guard: a 'mfa-pending' subject came
  // from the forced mid-login path (verify-enrollment completing it should also issue a real
  // session, exactly what a normal login would have done), while an 'access' subject is a
  // voluntary opt-in from an already-logged-in user (nothing more to issue).
  tokenType: 'access' | 'mfa-pending';
}

export interface RequestWithMfaSubject extends Request {
  mfaSubject?: MfaSubject;
}

// Guards POST /auth/v1/mfa/enroll and /verify-enrollment — accepts *either* a real access token
// (voluntary self-service enrollment, project doesn't require MFA yet) *or* an mfa-pending token
// (forced mid-login enrollment, scope.md §33 point 5c), normalizing both to the same
// { userId, projectId } shape before MfaService ever sees the request. One guard, one code path
// for both entry points, rather than two near-duplicate controllers guarded differently.
@Injectable()
export class MfaEnrollmentGuard implements CanActivate {
  constructor(private readonly jwt: AuthJwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithMfaSubject>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Access token or MFA token required');
    }
    const token = header.slice('Bearer '.length);

    const accessClaims = await this.jwt.verifyAccessToken(token);
    if (accessClaims) {
      request.mfaSubject = {
        userId: accessClaims.sub,
        projectId: accessClaims.projectId,
        tokenType: 'access',
      };
      return true;
    }

    const mfaClaims = await this.jwt.verifyMfaToken(token);
    if (mfaClaims) {
      request.mfaSubject = {
        userId: mfaClaims.sub,
        projectId: mfaClaims.projectId,
        tokenType: 'mfa-pending',
      };
      return true;
    }

    throw new UnauthorizedException('Access token or MFA token required');
  }
}
