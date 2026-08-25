import type { components } from '../generated/dataplane.js';

/** Every `error.code` the gateway itself emits, straight from the contract. */
export type GatewayErrorCode = NonNullable<
  NonNullable<components['schemas']['GatewayError']['error']>['code']
>;

/**
 * Codes the SDK synthesises for rejections that never reach the gateway's envelope:
 * a backend service rejected the request in its own framework's format, or the
 * transport failed before a response existed.
 */
export type SdkErrorCode = 'invalid_request' | 'network_error' | 'timeout' | 'aborted' | 'unknown_error';

export type SeamlessMapsErrorCode = GatewayErrorCode | SdkErrorCode;

/** One field-level complaint, when the rejecting service named fields. */
export interface ErrorDetail {
  /** Dotted path to the offending field, e.g. `query.limit`. Empty when unattributed. */
  readonly path: string;
  readonly message: string;
}

export interface SeamlessMapsErrorInit {
  readonly code: SeamlessMapsErrorCode;
  readonly message: string;
  readonly status?: number | undefined;
  readonly retryAfterSeconds?: number | undefined;
  readonly upgradeUrl?: string | undefined;
  readonly details?: readonly ErrorDetail[] | undefined;
  readonly body?: unknown;
  readonly cause?: unknown;
}

/**
 * The single error type this SDK throws.
 *
 * Four services behind the gateway reject in four different shapes - the gateway
 * envelope, a partial envelope, FastAPI's `detail` array, Hapi's `{statusCode,...}`
 * and a bare text body. Branch on {@link code}, never on {@link message}.
 */
export class SeamlessMapsError extends Error {
  readonly code: SeamlessMapsErrorCode;
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly upgradeUrl: string | undefined;
  readonly details: readonly ErrorDetail[];
  /** The parsed (or raw text) response body, kept for logging. */
  readonly body: unknown;

  constructor(init: SeamlessMapsErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = 'SeamlessMapsError';
    this.code = init.code;
    this.status = init.status;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.upgradeUrl = init.upgradeUrl;
    this.details = init.details ?? [];
    this.body = init.body;
  }

  /** True when the key, plan or quota is the problem rather than the request. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Codes we fall back to when the body tells us nothing, keyed by HTTP status. */
const STATUS_FALLBACK: Readonly<Record<number, SeamlessMapsErrorCode>> = {
  400: 'invalid_request',
  401: 'unauthenticated',
  403: 'unauthenticated',
  404: 'invalid_request',
  422: 'invalid_request',
  429: 'rate_limit_exceeded',
  500: 'internal_error',
  502: 'upstream_unavailable',
  503: 'upstream_unavailable',
  504: 'upstream_unavailable',
};

const headerRetryAfter = (response: Response): number | undefined => {
  const raw = response.headers.get('retry-after');
  if (raw === null) return undefined;
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) ? seconds : undefined;
};

/** FastAPI: `{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}`. */
const fromFastApiDetail = (detail: readonly unknown[]): readonly ErrorDetail[] =>
  detail.map((entry) => {
    if (!isRecord(entry)) return { path: '', message: String(entry) };
    const loc = Array.isArray(entry['loc']) ? entry['loc'].map(String).join('.') : '';
    return { path: loc, message: typeof entry['msg'] === 'string' ? entry['msg'] : JSON.stringify(entry) };
  });

const summarise = (details: readonly ErrorDetail[]): string =>
  details.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message)).join('; ');

/**
 * Collapse whichever error shape came back into one {@link SeamlessMapsError}.
 * Never throws: an unparseable body degrades to a status-derived code.
 */
export async function errorFromResponse(response: Response): Promise<SeamlessMapsError> {
  const fallbackCode = STATUS_FALLBACK[response.status] ?? 'unknown_error';
  const text = await response.text().catch(() => '');

  let body: unknown = text;
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }

  const base = {
    status: response.status,
    body,
    retryAfterSeconds: headerRetryAfter(response),
  };

  if (isRecord(body)) {
    // The gateway envelope, whole or partial.
    const envelope = body['error'];
    if (isRecord(envelope) && typeof envelope['code'] === 'string') {
      return new SeamlessMapsError({
        ...base,
        code: envelope['code'] as SeamlessMapsErrorCode,
        message: typeof envelope['message'] === 'string' ? envelope['message'] : envelope['code'],
        retryAfterSeconds:
          typeof envelope['retry_after_seconds'] === 'number'
            ? envelope['retry_after_seconds']
            : base.retryAfterSeconds,
        upgradeUrl: typeof envelope['upgrade_url'] === 'string' ? envelope['upgrade_url'] : undefined,
      });
    }

    // FastAPI (geocoder) validation failure.
    if (Array.isArray(body['detail'])) {
      const details = fromFastApiDetail(body['detail']);
      return new SeamlessMapsError({
        ...base,
        code: 'invalid_request',
        message: summarise(details) || 'Request validation failed',
        details,
      });
    }
    if (typeof body['detail'] === 'string') {
      return new SeamlessMapsError({ ...base, code: fallbackCode, message: body['detail'] });
    }

    // Hapi (travel-oracle) rejection: `{statusCode, error, message}`.
    if (typeof body['message'] === 'string') {
      return new SeamlessMapsError({ ...base, code: fallbackCode, message: body['message'] });
    }
  }

  const raw = typeof body === 'string' ? body.trim() : '';
  return new SeamlessMapsError({
    ...base,
    code: fallbackCode,
    message:
      raw.length > 0
        ? `${response.status} ${response.statusText}: ${raw}`.trim()
        : `${response.status} ${response.statusText}`.trim(),
  });
}
