import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Global rate-limit guard (scope.md §31). Tracks by IP alone for ordinary routes, but for a
// request carrying an `email` in its body (login/signup, and eventually mfa/verify) combines
// IP + email so a distributed brute force spread across many source IPs against one account
// can't hide behind each IP's own separate budget, and a shared IP (office NAT, mobile carrier)
// trying many different emails doesn't exhaust one shared budget for everyone behind it.
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const ip = await super.getTracker(req);
    const body = req.body as Record<string, unknown> | undefined;
    const email = typeof body?.email === 'string' ? body.email.toLowerCase() : null;
    return email ? `${ip}:${email}` : ip;
  }
}
