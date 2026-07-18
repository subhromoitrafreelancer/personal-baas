import { AuthClient } from './auth';
import { HttpClient } from './http';
import { QueryBuilder } from './query-builder';
import { StorageClient } from './storage';
import type { BaasClientConfig } from './types';

export class BaasClient {
  readonly auth: AuthClient;
  readonly storage: StorageClient;
  private readonly http: HttpClient;

  constructor(config: BaasClientConfig) {
    this.http = new HttpClient({
      url: config.url.replace(/\/$/, ''),
      apiKey: config.apiKey,
      schemaName: config.schemaName ?? 'api',
    });
    this.auth = new AuthClient(this.http);
    this.storage = new StorageClient(this.http);
  }

  from<T = Record<string, unknown>>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>(this.http, table);
  }

  async rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.http.requestJson<T>(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args });
  }
}

export function createClient(config: BaasClientConfig): BaasClient {
  return new BaasClient(config);
}
