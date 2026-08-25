import type { ResolvedConfig } from './config.js';
import { SeamlessMapsError, errorFromResponse } from './errors.js';

export interface RequestSpec {
  readonly method: 'GET' | 'POST';
  /** Path only, e.g. `/v1/geocode/search`. Joined onto `baseUrl`. */
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly body?: unknown;
  /** Caller-supplied cancellation, merged with the client timeout. */
  readonly signal?: AbortSignal | undefined;
}

export const buildUrl = (config: ResolvedConfig, spec: RequestSpec): string => {
  const url = new URL(config.baseUrl + spec.path);
  for (const [key, value] of Object.entries(spec.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
};

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new SeamlessMapsError({ code: 'aborted', message: 'Request aborted.' }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new SeamlessMapsError({ code: 'aborted', message: 'Request aborted.' }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * Decide whether a failed attempt is worth repeating.
 *
 * Three classes are retryable and one deliberately is not:
 *  - `rate_limit_exceeded`, because the gateway tells us exactly how long to wait;
 *  - a transport failure that never reached the gateway, so nothing was billed;
 *  - an upstream flap (502/503/504), which the gateway itself did not cause.
 *
 * A timed-out **POST** is not retried. `/v2/distance-matrix` is billed once per
 * request regardless of pair count (ADR-052) and the contract carries no
 * idempotency key, so a timeout cannot distinguish "never arrived" from
 * "succeeded slowly" - and retrying the second case bills the caller twice.
 * A timed-out GET has no such cost, so it is retried.
 *
 * Everything else - 4xx, `internal_error`, an explicit `aborted` - is the
 * caller's to handle. Repeating them only delays the error they need to see.
 */
export function isRetryable(error: SeamlessMapsError, method: RequestSpec['method']): boolean {
  if (error.code === 'rate_limit_exceeded') return true;
  if (error.code === 'network_error') return true;
  if (error.code === 'timeout') return method === 'GET';
  return error.status === 502 || error.status === 503 || error.status === 504;
}

/** Exponential backoff with full jitter, honouring a server-sent `retry_after_seconds`. */
export function retryDelayMs(
  error: SeamlessMapsError,
  attempt: number,
  retry: ResolvedConfig['retry'],
): number {
  if (typeof error.retryAfterSeconds === 'number' && error.retryAfterSeconds >= 0) {
    return Math.min(error.retryAfterSeconds * 1000, retry.maxDelayMs);
  }
  const ceiling = Math.min(retry.baseDelayMs * 2 ** attempt, retry.maxDelayMs);
  return Math.random() * ceiling;
}

const toSeamlessError = (cause: unknown, timedOut: boolean, aborted: boolean): SeamlessMapsError => {
  if (cause instanceof SeamlessMapsError) return cause;
  if (timedOut) {
    return new SeamlessMapsError({ code: 'timeout', message: 'The request timed out.', cause });
  }
  if (aborted) {
    return new SeamlessMapsError({ code: 'aborted', message: 'Request aborted.', cause });
  }
  return new SeamlessMapsError({
    code: 'network_error',
    message: cause instanceof Error ? cause.message : 'The request could not be sent.',
    cause,
  });
};

async function attempt(config: ResolvedConfig, spec: RequestSpec): Promise<Response> {
  const timeout = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    timeout.abort();
  }, config.timeoutMs);

  const signals = [timeout.signal, spec.signal].filter((s): s is AbortSignal => s !== undefined);

  try {
    return await config.fetch(buildUrl(config, spec), {
      method: spec.method,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        accept: 'application/json',
        ...(spec.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
      signal: AbortSignal.any(signals),
    });
  } catch (cause) {
    throw toSeamlessError(cause, timedOut, spec.signal?.aborted === true);
  } finally {
    clearTimeout(timer);
  }
}

/** Send one request, retrying per {@link isRetryable}, and parse the JSON body. */
export async function request<T>(config: ResolvedConfig, spec: RequestSpec): Promise<T> {
  let lastError: SeamlessMapsError | undefined;

  for (let i = 0; i <= config.retry.maxRetries; i += 1) {
    let error: SeamlessMapsError;
    try {
      const response = await attempt(config, spec);
      if (response.ok) return (await response.json()) as T;
      error = await errorFromResponse(response);
    } catch (thrown) {
      error = thrown as SeamlessMapsError;
    }

    lastError = error;
    if (i === config.retry.maxRetries || !isRetryable(error, spec.method)) throw error;
    await sleep(retryDelayMs(error, i, config.retry), spec.signal);
  }

  throw lastError ?? new SeamlessMapsError({ code: 'unknown_error', message: 'Request failed.' });
}
