import { describe, expect, it } from 'vitest';
import { SeamlessMapsError } from '../src/core/errors.js';
import { isRetryable, retryDelayMs } from '../src/core/http.js';

const err = (code: string, status?: number, retryAfterSeconds?: number) =>
  new SeamlessMapsError({
    code: code as never,
    message: 'x',
    ...(status === undefined ? {} : { status }),
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });

describe('isRetryable', () => {
  it('retries a rate limit on either method', () => {
    expect(isRetryable(err('rate_limit_exceeded', 429, 3), 'GET')).toBe(true);
    expect(isRetryable(err('rate_limit_exceeded', 429, 3), 'POST')).toBe(true);
  });

  it('retries a transport failure that never reached the gateway', () => {
    expect(isRetryable(err('network_error'), 'GET')).toBe(true);
    expect(isRetryable(err('network_error'), 'POST')).toBe(true);
  });

  it('retries a timed-out GET but not a timed-out POST', () => {
    // A matrix POST is billed once per request; a timeout cannot tell us whether
    // the gateway already counted it, so retrying could bill the caller twice.
    expect(isRetryable(err('timeout'), 'GET')).toBe(true);
    expect(isRetryable(err('timeout'), 'POST')).toBe(false);
  });

  it('retries an upstream flap', () => {
    for (const status of [502, 503, 504]) {
      expect(isRetryable(err('upstream_unavailable', status), 'POST')).toBe(true);
    }
  });

  it('never retries a rejection the caller caused', () => {
    expect(isRetryable(err('invalid_api_key', 401), 'GET')).toBe(false);
    expect(isRetryable(err('invalid_request', 422), 'GET')).toBe(false);
    expect(isRetryable(err('service_not_in_plan', 403), 'GET')).toBe(false);
    expect(isRetryable(err('internal_error', 500), 'GET')).toBe(false);
  });

  it('never retries an explicit abort', () => {
    expect(isRetryable(err('aborted'), 'GET')).toBe(false);
  });
});

describe('retryDelayMs', () => {
  const retry = { maxRetries: 2, baseDelayMs: 250, maxDelayMs: 8_000 };

  it('honours a server-sent retry_after_seconds', () => {
    expect(retryDelayMs(err('rate_limit_exceeded', 429, 3), 0, retry)).toBe(3_000);
  });

  it('caps a hostile retry_after at maxDelayMs', () => {
    expect(retryDelayMs(err('rate_limit_exceeded', 429, 9_999), 0, retry)).toBe(8_000);
  });

  it('backs off exponentially within a jittered ceiling', () => {
    for (const [attempt, ceiling] of [
      [0, 250],
      [1, 500],
      [2, 1000],
    ] as const) {
      for (let i = 0; i < 50; i += 1) {
        const delay = retryDelayMs(err('upstream_unavailable', 502), attempt, retry);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(ceiling);
      }
    }
  });
});
