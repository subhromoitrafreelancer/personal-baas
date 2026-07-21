import { HttpClient } from '../src/http';
import { QueryBuilder } from '../src/query-builder';

function makeHttp() {
  return new HttpClient({ url: 'http://example.test', apiKey: 'publishable-key', schemaName: 'api' });
}

beforeEach(() => {
  globalThis.fetch = jest.fn().mockResolvedValue(new Response('[]', { status: 200 }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

function lastCall() {
  const fetchMock = fetch as jest.Mock;
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: String(url), init: init as { method: string; body?: string; headers: Headers } };
}

describe('QueryBuilder URL/body construction', () => {
  it('builds a filtered, ordered, limited select', async () => {
    await new QueryBuilder(makeHttp(), 'tasks')
      .select('id,title')
      .eq('completed', false)
      .order('created_at', { ascending: false })
      .limit(20);

    const { url, init } = lastCall();
    expect(url).toContain('/rest/v1/tasks?');
    expect(url).toContain('select=id%2Ctitle');
    expect(url).toContain('order=created_at.desc');
    expect(url).toContain('limit=20');
    expect(url).toContain('completed=eq.false');
    expect(init.method).toBe('GET');
  });

  it('sends insert as POST with a JSON body and return=representation', async () => {
    await new QueryBuilder(makeHttp(), 'tasks').insert({ title: 'a' });

    const { init } = lastCall();
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ title: 'a' }));
    expect(init.headers.get('Prefer')).toBe('return=representation');
  });

  it('sends upsert with resolution=merge-duplicates and return=representation', async () => {
    await new QueryBuilder(makeHttp(), 'tasks').upsert({ id: 1, title: 'a' });

    const { init } = lastCall();
    expect(init.method).toBe('POST');
    expect(init.headers.get('Prefer')).toBe('resolution=merge-duplicates,return=representation');
  });

  it('sends update as PATCH scoped by a filter', async () => {
    await new QueryBuilder(makeHttp(), 'tasks').update({ title: 'b' }).eq('id', 1);

    const { url, init } = lastCall();
    expect(init.method).toBe('PATCH');
    expect(url).toContain('id=eq.1');
  });

  it('sends delete as DELETE', async () => {
    await new QueryBuilder(makeHttp(), 'tasks').delete().eq('id', 1);

    const { init } = lastCall();
    expect(init.method).toBe('DELETE');
  });

  it('sends in() as a comma-joined PostgREST in.() filter', async () => {
    await new QueryBuilder(makeHttp(), 'tasks').select().in('id', [1, 2, 3]);

    const { url } = lastCall();
    expect(url).toContain('id=in.(1,2,3)');
  });

  it('sends range() as Range/Range-Unit headers rather than a query param', async () => {
    await new QueryBuilder(makeHttp(), 'tasks').select().range(0, 9);

    const { url, init } = lastCall();
    expect(url).not.toContain('range');
    expect(init.headers.get('Range-Unit')).toBe('items');
    expect(init.headers.get('Range')).toBe('0-9');
  });

  it('sets Accept: application/vnd.pgrst.object+json for single()/maybeSingle()', async () => {
    await new QueryBuilder(makeHttp(), 'tasks').select().eq('id', 1).single();

    const { init } = lastCall();
    expect(init.headers.get('Accept')).toBe('application/vnd.pgrst.object+json');
  });

  it('maybeSingle() resolves to null on a 406 instead of throwing', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'no rows' }), { status: 406 }),
    );

    const result = await new QueryBuilder(makeHttp(), 'tasks').select().eq('id', 999).maybeSingle();

    expect(result).toBeNull();
  });

  it('single() throws on a 406 instead of resolving to null', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'no rows' }), { status: 406 }),
    );

    await expect(new QueryBuilder(makeHttp(), 'tasks').select().eq('id', 999).single()).rejects.toThrow(
      'no rows',
    );
  });
});
