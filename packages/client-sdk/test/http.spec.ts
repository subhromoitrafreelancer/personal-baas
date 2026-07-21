import { HttpClient } from '../src/http';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

function makeClient() {
  return new HttpClient({ url: 'http://example.test', apiKey: 'publishable-key', schemaName: 'api' });
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage();
  globalThis.fetch = jest.fn();
});

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
  jest.restoreAllMocks();
});

describe('HttpClient session persistence', () => {
  it('persists a session to localStorage and reloads it in a new instance', () => {
    const client = makeClient();
    client.setSession({ accessToken: 'a1', refreshToken: 'r1', user: { id: 'u1', email: 'x@example.test' } });

    const reloaded = makeClient();
    expect(reloaded.getSession()?.accessToken).toBe('a1');
  });

  it('clears persisted session when set to null', () => {
    const client = makeClient();
    client.setSession({ accessToken: 'a1', refreshToken: 'r1', user: { id: 'u1', email: 'x@example.test' } });
    client.setSession(null);

    const reloaded = makeClient();
    expect(reloaded.getSession()).toBeNull();
  });
});

describe('HttpClient auto-refresh-and-retry-once', () => {
  it('refreshes the session once on a 401 and retries the original request', async () => {
    const client = makeClient();
    client.setSession({ accessToken: 'expired', refreshToken: 'r1', user: { id: 'u1', email: 'x@example.test' } });

    const fetchMock = fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'fresh', refreshToken: 'r2' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1 }]), { status: 200 }));

    const res = await client.request('/rest/v1/tasks');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res.status).toBe(200);
    expect(client.getSession()?.accessToken).toBe('fresh');
  });

  it('does not loop a second time if the retried request also 401s', async () => {
    const client = makeClient();
    client.setSession({ accessToken: 'expired', refreshToken: 'r1', user: { id: 'u1', email: 'x@example.test' } });

    const fetchMock = fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'fresh', refreshToken: 'r2' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }));

    const res = await client.request('/rest/v1/tasks');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res.status).toBe(401);
  });

  it('clears the session when the refresh call itself fails', async () => {
    const client = makeClient();
    client.setSession({ accessToken: 'expired', refreshToken: 'r1', user: { id: 'u1', email: 'x@example.test' } });

    const fetchMock = fetch as jest.Mock;
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(
      new Response(null, { status: 401 }),
    );

    await client.request('/rest/v1/tasks');

    expect(client.getSession()).toBeNull();
  });

  it('does not attempt a refresh when there is no session at all', async () => {
    const client = makeClient();
    const fetchMock = fetch as jest.Mock;
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

    const res = await client.request('/rest/v1/tasks');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
  });
});

describe('HttpClient schema profile header', () => {
  it('sends Accept-Profile on GET rest requests and Content-Profile on mutating ones', async () => {
    const client = makeClient();
    const fetchMock = fetch as jest.Mock;
    fetchMock.mockResolvedValue(new Response('[]', { status: 200 }));

    await client.request('/rest/v1/tasks');
    const getHeaders = fetchMock.mock.calls[0][1].headers as Headers;
    expect(getHeaders.get('Accept-Profile')).toBe('api');

    await client.request('/rest/v1/tasks', { method: 'POST', body: { title: 'x' } });
    const postHeaders = fetchMock.mock.calls[1][1].headers as Headers;
    expect(postHeaders.get('Content-Profile')).toBe('api');
  });

  it('does not attach a profile header to non-rest paths', async () => {
    const client = makeClient();
    const fetchMock = fetch as jest.Mock;
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    await client.request('/auth/v1/login', { method: 'POST', isRest: false, body: {} });
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.has('Accept-Profile')).toBe(false);
    expect(headers.has('Content-Profile')).toBe(false);
  });
});
