import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  // Connection string for the baas_admin role — the only role the control service uses to
  // talk to Postgres. Never used for application-table access (that goes through PostgREST).
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Signs the admin console's httpOnly session cookie. Deliberately separate from the
  // application-user JWT signing keys (Phase 3) — admin auth and app auth stay cryptographically
  // independent even though both use JWTs.
  ADMIN_SESSION_SECRET: z
    .string()
    .min(32, 'ADMIN_SESSION_SECRET must be at least 32 characters'),
  // Used once, on first boot, to create the initial platform administrator if
  // platform.platform_admins is empty. Safe to leave unset after that.
  INITIAL_ADMIN_EMAIL: z.string().email().optional(),
  INITIAL_ADMIN_PASSWORD: z.string().min(8).optional(),
  // Dedicated connection pool for admin-issued SQL (SQL console, catalog explorer) — kept
  // separate from the control service's own internal-query pool so a runaway or cancelled
  // admin query can never starve health checks or admin-auth lookups.
  ADMIN_SQL_POOL_MAX: z.coerce.number().int().positive().default(10),
  ADMIN_SQL_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  // Ed25519 keypair signing application-user access tokens (scope.md §8). Deliberately
  // asymmetric and separate from ADMIN_SESSION_SECRET: PostgREST (Phase 4) and clients only
  // ever need the public half. PEM, base64-encoded so a multi-line key survives a single
  // .env line — generate with `npm run generate:jwt-keys --workspace apps/control-server`.
  AUTH_JWT_PRIVATE_KEY_BASE64: z.string().min(1, 'AUTH_JWT_PRIVATE_KEY_BASE64 is required'),
  AUTH_JWT_PUBLIC_KEY_BASE64: z.string().min(1, 'AUTH_JWT_PUBLIC_KEY_BASE64 is required'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // Used by /health/ready's PostgREST reachability check (Phase 6 #4) — internal docker-network
  // address only, never routed through Caddy.
  POSTGREST_URL: z.string().url().default('http://postgrest:3001'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}
