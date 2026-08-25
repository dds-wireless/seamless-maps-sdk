import { describe, expect, it } from 'vitest';
import { SeamlessMapsError, errorFromResponse } from '../src/core/errors.js';

const res = (status: number, body: unknown, contentType = 'application/json') =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  });

describe('errorFromResponse', () => {
  it('reads the gateway envelope', async () => {
    const err = await errorFromResponse(
      res(429, {
        error: {
          code: 'rate_limit_exceeded',
          message: 'Too many requests',
          retry_after_seconds: 30,
          upgrade_url: 'https://example.test/upgrade',
        },
      }),
    );
    expect(err).toBeInstanceOf(SeamlessMapsError);
    expect(err.code).toBe('rate_limit_exceeded');
    expect(err.status).toBe(429);
    expect(err.retryAfterSeconds).toBe(30);
    expect(err.upgradeUrl).toBe('https://example.test/upgrade');
  });

  it('reads a partial envelope with no retry_after_seconds or upgrade_url', async () => {
    const err = await errorFromResponse(
      res(403, { error: { code: 'invalid_session_token', message: 'Session token invalid' } }),
    );
    expect(err.code).toBe('invalid_session_token');
    expect(err.retryAfterSeconds).toBeUndefined();
    expect(err.upgradeUrl).toBeUndefined();
  });

  it('normalises a FastAPI 422 detail array', async () => {
    const err = await errorFromResponse(
      res(422, {
        detail: [{ loc: ['query', 'limit'], msg: 'ensure this value is <= 10', type: 'value_error' }],
      }),
    );
    expect(err.code).toBe('invalid_request');
    expect(err.status).toBe(422);
    expect(err.message).toContain('limit');
    expect(err.message).toContain('ensure this value is <= 10');
    expect(err.details).toHaveLength(1);
  });

  it('normalises a Hapi 400 body', async () => {
    const err = await errorFromResponse(
      res(400, { statusCode: 400, error: 'Bad Request', message: '"origins" is required' }),
    );
    expect(err.code).toBe('invalid_request');
    expect(err.message).toBe('"origins" is required');
  });

  it('falls back to the raw text body when the response is not JSON', async () => {
    const err = await errorFromResponse(res(500, 'Internal Server Error', 'text/plain'));
    expect(err.code).toBe('internal_error');
    expect(err.status).toBe(500);
    expect(err.message).toContain('Internal Server Error');
  });

  it('falls back on an empty body', async () => {
    const err = await errorFromResponse(new Response(null, { status: 502 }));
    expect(err.code).toBe('upstream_unavailable');
    expect(err.status).toBe(502);
  });

  it('prefers the Retry-After header when the envelope omits it', async () => {
    const r = new Response(JSON.stringify({ error: { code: 'rate_limit_exceeded', message: 'slow down' } }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '12' },
    });
    const err = await errorFromResponse(r);
    expect(err.retryAfterSeconds).toBe(12);
  });
});
