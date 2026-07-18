import { HttpClient } from './http';
import type { AuthUser, Session } from './types';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export class AuthClient {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  getSession(): Session | null {
    return this.http.getSession();
  }

  currentUser(): AuthUser | null {
    return this.http.getSession()?.user ?? null;
  }

  isSignedIn(): boolean {
    return this.http.getSession() !== null;
  }

  async signUp(email: string, password: string): Promise<AuthUser> {
    return this.http.requestJson<AuthUser>('/auth/v1/signup', {
      method: 'POST',
      isRest: false,
      body: { email, password },
    });
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const result = await this.http.requestJson<LoginResponse>('/auth/v1/login', {
      method: 'POST',
      isRest: false,
      body: { email, password },
    });
    this.http.setSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
    return result.user;
  }

  async signOut(): Promise<void> {
    if (this.http.getSession()) {
      await this.http.request('/auth/v1/logout', { method: 'POST', isRest: false });
    }
    this.http.setSession(null);
  }

  // Re-fetches the current user from /auth/v1/user against a persisted session (e.g. on app
  // load) and clears the session if it's no longer valid. Returns null either way when signed out.
  async restoreSession(): Promise<AuthUser | null> {
    if (!this.http.getSession()) return null;
    const res = await this.http.request('/auth/v1/user', { method: 'GET', isRest: false });
    if (!res.ok) {
      this.http.setSession(null);
      return null;
    }
    const user = (await res.json()) as AuthUser;
    const session = this.http.getSession();
    if (session) this.http.setSession({ ...session, user });
    return user;
  }
}
