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
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}
