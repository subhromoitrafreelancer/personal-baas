import type { BaasClientConfig, Session } from './types';

const REST_PREFIX = '/rest/v1/';

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Whether to attach the Accept-Profile/Content-Profile schema header. Defaults to whether
   * the path starts with /rest/v1/ (covers both table and rpc endpoints). */
  isRest?: boolean;
}

// Shared fetch layer: one Authorization: Bearer header throughout (publishable key pre-login,
// session access token post-login), auto-refresh-and-retry-once on 401, and the
// Accept-Profile/Content-Profile schema header PostgREST needs once more than one project's
// schema is exposed (Phase 9, scope.md §23) -- ported from examples/todo-app/js/api.js's
// hand-written fetch wrapper into a reusable, session-encapsulated class.
export class HttpClient {
  private session: Session | null;
  private readonly storageKey: string;
  private readonly url: string;
  private readonly apiKey: string;
  private readonly schemaName: string;

  constructor(config: Required<Pick<BaasClientConfig, 'url' | 'apiKey' | 'schemaName'>>) {
    this.url = config.url;
    this.apiKey = config.apiKey;
    this.schemaName = config.schemaName;
    this.storageKey = `baas.${config.schemaName}.session`;
    this.session = this.loadSession();
  }

  getSession(): Session | null {
    return this.session;
  }

  setSession(session: Session | null): void {
    this.session = session;
    if (typeof localStorage === 'undefined') return;
    if (session) localStorage.setItem(this.storageKey, JSON.stringify(session));
    else localStorage.removeItem(this.storageKey);
  }

  private loadSession(): Session | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  }

  private authHeader(): string {
    return `Bearer ${this.session ? this.session.accessToken : this.apiKey}`;
  }

  private profileHeaderName(method: string): string {
    return method === 'GET' || method === 'HEAD' ? 'Accept-Profile' : 'Content-Profile';
  }

  private async refreshSession(): Promise<boolean> {
    if (!this.session?.refreshToken) return false;
    const res = await fetch(`${this.url}/auth/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.session.refreshToken }),
    });
    if (!res.ok) {
      this.setSession(null);
      return false;
    }
    const result = (await res.json()) as { accessToken: string; refreshToken: string };
    this.setSession({
      ...this.session,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return true;
  }

  async request(path: string, options: RequestOptions = {}): Promise<Response> {
    const method = options.method ?? 'GET';
    const isRest = options.isRest ?? path.startsWith(REST_PREFIX);
    const headers = new Headers(options.headers);
    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      if (options.body instanceof FormData) {
        body = options.body;
      } else {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(options.body);
      }
    }
    if (isRest) headers.set(this.profileHeaderName(method), this.schemaName);

    const attempt = async (allowRetry: boolean): Promise<Response> => {
      const attemptHeaders = new Headers(headers);
      attemptHeaders.set('Authorization', this.authHeader());
      const res = await fetch(`${this.url}${path}`, { method, headers: attemptHeaders, body });
      if (res.status === 401 && allowRetry && this.session?.refreshToken) {
        const refreshed = await this.refreshSession();
        if (refreshed) return attempt(false);
      }
      return res;
    };

    return attempt(true);
  }

  async requestJson<T>(path: string, options?: RequestOptions): Promise<T> {
    const res = await this.request(path, options);
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const message: unknown = (body && (body.message ?? body.error)) ?? res.statusText;
      throw new Error(Array.isArray(message) ? message.join(', ') : String(message));
    }
    return body as T;
  }
}
