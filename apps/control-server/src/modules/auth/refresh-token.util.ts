import { createHash, randomBytes } from 'node:crypto';

// Refresh tokens are high-entropy random values, not user-chosen secrets — a fast hash is
// the standard approach here (unlike passwords, which need argon2's deliberate slowness).
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
