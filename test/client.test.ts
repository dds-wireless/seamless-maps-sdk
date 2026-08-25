import { describe, expect, it, vi } from 'vitest';
import { SeamlessMapsError, createClient } from '../src/index.js';

interface Call {
  url: URL;
  init: RequestInit;
}

const stub = (responses: Array<Response | (() => Response)>) => {
  const calls: Call[] = [];
  let i = 0;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), init: init ?? {} });
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return typeof next === 'function' ? next() : (next as Response);
  });
  return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const client = (fetch: typeof globalThis.fetch, retry = { maxRetries: 0 }) =>
  createClient({ apiKey: 'pk_test_key', baseUrl: 'https://gw.test', fetch, retry });

describe('createClient', () => {
  it('rejects a missing key at construction, not at first call', () => {
    expect(() => createClient({ apiKey: '' })).toThrow(SeamlessMapsError);
    expect(() => createClient({ apiKey: '  ' })).toThrow(/apiKey/);
  });

  it('rejects a baseUrl that is not absolute', () => {
    expect(() => createClient({ apiKey: 'k', baseUrl: '/v1' })).toThrow(/absolute URL/);
  });

  it('strips a trailing slash from baseUrl so paths do not double up', async () => {
    const { calls, fetch } = stub([json({ query: 'x', primary: null, alternates: [] })]);
    await createClient({ apiKey: 'k', baseUrl: 'https://gw.test/', fetch }).geocode.search({ query: 'a' });
    expect(calls[0]!.url.pathname).toBe('/v1/geocode/search');
  });

  it('sends the key as a Bearer token', async () => {
    const { calls, fetch } = stub([json({ query: 'x', primary: null, alternates: [] })]);
    await client(fetch).geocode.search({ query: 'main st' });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer pk_test_key');
  });
});

describe('geocode', () => {
  it('maps search options onto the documented query parameters', async () => {
    const { calls, fetch } = stub([json({ query: 'x', primary: null, alternates: [] })]);
    await client(fetch).geocode.search({
      query: '1050 W Pender',
      near: { latitude: 49.28, longitude: -123.12 },
      fuzziness: 'strict',
    });
    const q = calls[0]!.url.searchParams;
    expect(calls[0]!.url.pathname).toBe('/v1/geocode/search');
    expect(q.get('q')).toBe('1050 W Pender');
    expect(q.get('lat')).toBe('49.28');
    expect(q.get('lng')).toBe('-123.12');
    expect(q.get('fuzziness')).toBe('strict');
    expect(q.has('region')).toBe(false);
  });

  it('omits absent options rather than sending empty values', async () => {
    const { calls, fetch } = stub([json({ query: 'x', primary: null, alternates: [] })]);
    await client(fetch).geocode.search({ query: 'x' });
    expect([...calls[0]!.url.searchParams.keys()]).toEqual(['q']);
  });

  it('sends reverse coordinates and limit', async () => {
    const { calls, fetch } = stub([json({ primary: null, alternates: [] })]);
    await client(fetch).geocode.reverse({ latitude: 49.1, longitude: -123.2, limit: 5 });
    const q = calls[0]!.url.searchParams;
    expect(calls[0]!.url.pathname).toBe('/v1/geocode/reverse');
    expect(q.get('lat')).toBe('49.1');
    expect(q.get('lng')).toBe('-123.2');
    expect(q.get('limit')).toBe('5');
  });

  it('sends autocomplete queries', async () => {
    const { calls, fetch } = stub([json({ suggestions: [] })]);
    await client(fetch).geocode.autocomplete({ query: 'gran', limit: 3 });
    expect(calls[0]!.url.pathname).toBe('/v1/geocode/autocomplete');
    expect(calls[0]!.url.searchParams.get('q')).toBe('gran');
    expect(calls[0]!.url.searchParams.get('limit')).toBe('3');
  });

  it('surfaces a geocoder 422 as a typed validation error', async () => {
    const { fetch } = stub([
      json({ detail: [{ loc: ['query', 'limit'], msg: 'must be <= 10', type: 'value_error' }] }, 422),
    ]);
    await expect(
      client(fetch).geocode.reverse({ latitude: 1, longitude: 2, limit: 99 }),
    ).rejects.toMatchObject({
      code: 'invalid_request',
      status: 422,
    });
  });
});

describe('matrix', () => {
  const body = { data: [], summary: { total: 0, successes: 0, failures: 0 } };

  it('wraps plain coordinates into the contract point shape', async () => {
    const { calls, fetch } = stub([json(body)]);
    await client(fetch).matrix({
      origins: [{ latitude: 49.28, longitude: -123.12 }],
      destinations: [
        { latitude: 49.2, longitude: -123.1 },
        { latitude: 49.3, longitude: -123.0 },
      ],
    });
    expect(calls[0]!.url.pathname).toBe('/v2/distance-matrix');
    expect(calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      origins: [{ point: { latitude: 49.28, longitude: -123.12 } }],
      destinations: [
        { point: { latitude: 49.2, longitude: -123.1 } },
        { point: { latitude: 49.3, longitude: -123.0 } },
      ],
    });
  });

  it('passes departAt through as options.departAt', async () => {
    const { calls, fetch } = stub([json(body)]);
    await client(fetch).matrix({
      origins: [{ latitude: 1, longitude: 2 }],
      destinations: [{ latitude: 3, longitude: 4 }],
      departAt: '2026-08-21T08:00',
    });
    expect(JSON.parse(String(calls[0]!.init.body)).options).toEqual({ departAt: '2026-08-21T08:00' });
  });

  it('rejects an empty origins list before spending a request', async () => {
    const { calls, fetch } = stub([json(body)]);
    await expect(
      client(fetch).matrix({ origins: [], destinations: [{ latitude: 1, longitude: 2 }] }),
    ).rejects.toThrow(/origins/);
    expect(calls).toHaveLength(0);
  });

  it('rejects an out-of-range coordinate before spending a request', async () => {
    const { calls, fetch } = stub([json(body)]);
    await expect(
      client(fetch).matrix({
        origins: [{ latitude: 91, longitude: 2 }],
        destinations: [{ latitude: 1, longitude: 2 }],
      }),
    ).rejects.toThrow(/latitude/);
    expect(calls).toHaveLength(0);
  });
});

describe('tiles', () => {
  it('builds the style URL against the configured gateway', () => {
    const { fetch } = stub([json({})]);
    expect(client(fetch).tiles.styleUrl()).toBe('https://gw.test/v1/tiles/style.json');
  });

  it('fetches the style document with the key attached', async () => {
    const style = { version: 8, sources: {}, layers: [] };
    const { calls, fetch } = stub([json(style)]);
    await expect(client(fetch).tiles.style()).resolves.toEqual(style);
    expect((calls[0]!.init.headers as Record<string, string>)['authorization']).toBe('Bearer pk_test_key');
  });
});

describe('retrying', () => {
  it('retries an upstream flap and returns the eventual success', async () => {
    const { calls, fetch } = stub([
      () => json({ error: { code: 'upstream_unavailable', message: 'down' } }, 502),
      () => json({ query: 'x', primary: null, alternates: [] }),
    ]);
    const c = createClient({
      apiKey: 'k',
      baseUrl: 'https://gw.test',
      fetch,
      retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2 },
    });
    await expect(c.geocode.search({ query: 'x' })).resolves.toEqual({
      query: 'x',
      primary: null,
      alternates: [],
    });
    expect(calls).toHaveLength(2);
  });

  it('does not retry a 401', async () => {
    const { calls, fetch } = stub([json({ error: { code: 'invalid_api_key', message: 'nope' } }, 401)]);
    const c = createClient({
      apiKey: 'k',
      baseUrl: 'https://gw.test',
      fetch,
      retry: { maxRetries: 3, baseDelayMs: 1 },
    });
    await expect(c.geocode.search({ query: 'x' })).rejects.toMatchObject({ code: 'invalid_api_key' });
    expect(calls).toHaveLength(1);
  });
});
