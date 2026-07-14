import { AuthUserRow } from './auth-users.repository';

export interface PublicUser {
  id: string;
  email: string;
  status: string;
  emailVerified: boolean;
  role: string;
  userMetadata: Record<string, unknown>;
  appMetadata: Record<string, unknown>;
  createdAt: string;
  lastSignInAt: string | null;
}

export function toPublicUser(row: AuthUserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    emailVerified: row.email_verified,
    role: row.role,
    userMetadata: row.user_metadata,
    appMetadata: row.app_metadata,
    createdAt: row.created_at.toISOString(),
    lastSignInAt: row.last_sign_in_at?.toISOString() ?? null,
  };
}
