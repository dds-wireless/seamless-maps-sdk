import { SeamlessMapsError } from './errors.js';

/** The production data plane. Override only to point at a staging gateway. */
export const DEFAULT_BASE_URL = 'https://seamlessmaps-api.ddswireless.net';

/** Milliseconds before an in-flight request is abandoned. */
export const DEFAULT_TIMEOUT_MS = 15_000;

export interface RetryOptions {
  /** Attempts *after* the first. `0` disables retrying. */
  readonly maxRetries?: number;
  /** Base delay for the exponential backoff, in milliseconds. */
  readonly baseDelayMs?: number;
  /** Ceiling for any single backoff wait, in milliseconds. */
  readonly maxDelayMs?: number;
}

export interface ClientOptions {
  /**
   * Your API key. A key restricted to a set of origins is **browser-only** - the
   * gateway rejects it when `Origin` is absent, so server-side code needs its own key.
   */
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly retry?: RetryOptions;
  /** Injected for tests, or to add tracing. Defaults to the global `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
}

export interface ResolvedConfig {
  readonly apiKey: string;
  /** Normalised: absolute, no trailing slash. */
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly retry: Required<RetryOptions>;
  readonly fetch: typeof globalThis.fetch;
}

const DEFAULT_RETRY: Required<RetryOptions> = {
  maxRetries: 2,
  baseDelayMs: 250,
  maxDelayMs: 8_000,
};

/** Validate and normalise at the trust boundary, so every later use can assume. */
export function resolveConfig(options: ClientOptions): ResolvedConfig {
  if (typeof options?.apiKey !== 'string' || options.apiKey.trim() === '') {
    throw new SeamlessMapsError({
      code: 'missing_api_key',
      message: 'createClient requires an `apiKey`.',
    });
  }

  const rawBase = options.baseUrl ?? DEFAULT_BASE_URL;
  let baseUrl: string;
  try {
    baseUrl = new URL(rawBase).toString().replace(/\/+$/, '');
  } catch (cause) {
    throw new SeamlessMapsError({
      code: 'invalid_request',
      message: `\`baseUrl\` is not a valid absolute URL: ${rawBase}`,
      cause,
    });
  }

  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new SeamlessMapsError({
      code: 'invalid_request',
      message: 'No `fetch` implementation available. Pass one via `fetch` on Node < 18.',
    });
  }

  return {
    apiKey: options.apiKey.trim(),
    baseUrl,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retry: { ...DEFAULT_RETRY, ...options.retry },
    // Unbound `fetch` throws "Illegal invocation" in browsers.
    fetch: doFetch.bind(globalThis),
  };
}
