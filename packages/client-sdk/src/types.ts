export interface BaasClientConfig {
  url: string;
  apiKey: string;
  /** Postgres schema this client talks to (Phase 9 multi-project — scope.md §23). Defaults to "api". */
  schemaName?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  userMetadata?: Record<string, unknown>;
  appMetadata?: Record<string, unknown>;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
