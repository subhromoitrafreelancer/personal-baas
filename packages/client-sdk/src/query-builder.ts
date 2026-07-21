import { HttpClient } from './http';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

// Small, documented query builder over PostgREST's URL grammar -- not an attempt at full
// Supabase SDK compatibility (scope.md §15). Thenable so `await client.from(x).select().eq(...)`
// works without a separate .execute() call, same ergonomics as the SDK this is modeled on.
export class QueryBuilder<T = Record<string, unknown>> implements PromiseLike<T | T[] | null> {
  private readonly filters: string[] = [];
  private selectCols = '*';
  private readonly orderClauses: string[] = [];
  private limitCount: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private method: Method = 'GET';
  private body: unknown;
  private preferReturn = false;
  private preferResolution: 'merge-duplicates' | null = null;
  private wantSingle = false;
  private wantMaybeSingle = false;

  private readonly http: HttpClient;
  private readonly table: string;

  constructor(http: HttpClient, table: string) {
    this.http = http;
    this.table = table;
  }

  select(columns = '*'): this {
    this.selectCols = columns;
    if (this.method !== 'GET') this.preferReturn = true;
    return this;
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]): this {
    this.method = 'POST';
    this.body = values;
    this.preferReturn = true;
    return this;
  }

  upsert(values: Record<string, unknown> | Record<string, unknown>[]): this {
    this.method = 'POST';
    this.body = values;
    this.preferReturn = true;
    this.preferResolution = 'merge-duplicates';
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.method = 'PATCH';
    this.body = values;
    this.preferReturn = true;
    return this;
  }

  delete(): this {
    this.method = 'DELETE';
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.addFilter(column, 'eq', value);
  }
  neq(column: string, value: unknown): this {
    return this.addFilter(column, 'neq', value);
  }
  gt(column: string, value: unknown): this {
    return this.addFilter(column, 'gt', value);
  }
  gte(column: string, value: unknown): this {
    return this.addFilter(column, 'gte', value);
  }
  lt(column: string, value: unknown): this {
    return this.addFilter(column, 'lt', value);
  }
  lte(column: string, value: unknown): this {
    return this.addFilter(column, 'lte', value);
  }
  like(column: string, pattern: string): this {
    return this.addFilter(column, 'like', pattern);
  }
  ilike(column: string, pattern: string): this {
    return this.addFilter(column, 'ilike', pattern);
  }
  is(column: string, value: 'null' | 'true' | 'false'): this {
    this.filters.push(`${column}=is.${value}`);
    return this;
  }
  in(column: string, values: unknown[]): this {
    this.filters.push(
      `${column}=in.(${values.map((v) => encodeURIComponent(String(v))).join(',')})`,
    );
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}): this {
    this.orderClauses.push(`${column}.${options.ascending === false ? 'desc' : 'asc'}`);
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  // Alternative to limit(): an inclusive 0-based row range, sent as PostgREST's Range header
  // rather than a query param (mirrors the underlying REST API rather than adding a redundant
  // offset() method).
  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  // Expect exactly one row; throws (via PostgREST's 406) if zero or more than one match.
  single(): this {
    this.wantSingle = true;
    return this;
  }

  // Like single(), but zero matches resolves to null instead of throwing.
  maybeSingle(): this {
    this.wantMaybeSingle = true;
    return this;
  }

  private addFilter(column: string, op: string, value: unknown): this {
    this.filters.push(`${column}=${op}.${encodeURIComponent(String(value))}`);
    return this;
  }

  private buildPath(): string {
    const params = new URLSearchParams();
    if (this.method === 'GET' && this.selectCols !== '*') params.set('select', this.selectCols);
    if (this.method === 'GET' && this.orderClauses.length)
      params.set('order', this.orderClauses.join(','));
    if (this.method === 'GET' && this.limitCount != null)
      params.set('limit', String(this.limitCount));

    const query = [params.toString(), this.filters.join('&')].filter(Boolean).join('&');
    return `/rest/v1/${this.table}${query ? `?${query}` : ''}`;
  }

  private async execute(): Promise<T | T[] | null> {
    const headers: Record<string, string> = {};
    const prefer = [
      this.preferResolution ? `resolution=${this.preferResolution}` : null,
      this.preferReturn ? 'return=representation' : null,
    ].filter(Boolean);
    if (prefer.length) headers.Prefer = prefer.join(',');
    if (this.wantSingle || this.wantMaybeSingle)
      headers.Accept = 'application/vnd.pgrst.object+json';
    if (this.method === 'GET' && this.rangeFrom != null && this.rangeTo != null) {
      headers['Range-Unit'] = 'items';
      headers.Range = `${this.rangeFrom}-${this.rangeTo}`;
    }

    const res = await this.http.request(this.buildPath(), {
      method: this.method,
      body: this.body,
      headers,
    });
    const text = await res.text();
    const parsed: unknown = text ? JSON.parse(text) : null;

    if (!res.ok) {
      if (this.wantMaybeSingle && res.status === 406) return null;
      const parsedObj = parsed as { message?: unknown; error?: unknown } | null;
      const message = (parsedObj && (parsedObj.message ?? parsedObj.error)) ?? res.statusText;
      throw new Error(Array.isArray(message) ? message.join(', ') : String(message));
    }
    return parsed as T | T[] | null;
  }

  then<TResult1 = T | T[] | null, TResult2 = never>(
    onfulfilled?: ((value: T | T[] | null) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}
