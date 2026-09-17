import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Global rate-limit guard (scope.md §31). Tracks by IP alone for ordinary routes. For a request
// carrying an `email` (login/signup/password-reset/mfa) or `mfaToken` (mfa/verify) in its body,
// tracks by that value ALONE, not combined with IP: a security-audit finding (scope.md Phase 25)
// found that combining ip+email gives each distinct source IP its own separate budget against the
// same target account, so a distributed attacker (botnet/proxy pool) gets N times the intended
// attempt budget by rotating IPs. Keying by email/mfaToken alone closes that gap while still
// keeping different legitimate users behind one shared IP (office NAT, mobile carrier) from
// exhausting a single shared budget, since they have different emails. The global per-IP throttle
// (RATE_LIMIT_GLOBAL_MAX) remains the backstop against one IP hitting many different targets.
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const body = req.body as Record<string, unknown> | undefined;
    const email = typeof body?.email === 'string' ? body.email.toLowerCase() : null;
    if (email) {
      return `email:${email}`;
    }
    const mfaToken = typeof body?.mfaToken === 'string' ? body.mfaToken : null;
    if (mfaToken) {
      return `mfa:${mfaToken}`;
    }
    return super.getTracker(req);
  }
}
