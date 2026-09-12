// Per-route override for /auth/v1/login, /auth/v1/signup (and, once Phase 19/MFA ships,
// /auth/v1/mfa/verify) — a stricter limit than the global default (scope.md §31 point 3).
// @nestjs/throttler's `@Throttle()` decorator only accepts literal values (it runs at class
// decoration time, not through Nest's DI), so this reads process.env directly rather than the
// zod-validated EnvConfig — a misconfigured value here just falls back to the default below,
// it's not a security boundary that silently breaks.
export const AUTH_THROTTLE = {
  default: {
    limit: Number(process.env.RATE_LIMIT_AUTH_MAX ?? 10),
    ttl: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS ?? 60_000),
  },
};

// Per-route override for POST /internal/email/send (scope.md §32 point 9) — a volume control on
// ctx.email.send(), reusing this same infrastructure rather than a new per-project quota table.
export const EMAIL_SEND_THROTTLE = {
  default: {
    limit: Number(process.env.EMAIL_MAX_PER_MINUTE ?? 60),
    ttl: 60_000,
  },
};
